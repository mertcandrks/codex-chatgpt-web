const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const os = require("node:os");
const { BrowserHost } = require("../electron/browser-host.cjs");

function fixture(failure) {
  const source = fs.readFileSync(path.join(__dirname, "../electron/main.cjs"), "utf8");
  const start = source.indexOf("async function enterNativeBackground(");
  assert.notEqual(start, -1, "Native background transition must exist");
  const calls = [];
  const host = { currentOperation: () => null, persistSession: async () => calls.push("persist"), destroy: options => {
    assert.equal(options.preserveControlDescriptor, true);
    if (failure === "destroy") throw new Error("descriptor write failed");
    calls.push("destroy");
  } };
  const context = vm.createContext({
    nativeBackground: false, backgroundTransition: null, backgroundLanguage: "tr", IS_DEV_PROFILE: false,
    runtimeHost: { currentOperation: () => null }, browserHost: host,
    runtimeSupervisor: {
      nativeBackground: false,
      enterNativeBackground: async () => {
        calls.push("pause"); if (failure === "pause") throw Error("busy");
        context.runtimeSupervisor.nativeBackground = true;
      },
      resumeWebRuntime: async () => {
        calls.push("resume"); if (failure === "resume") throw Error("failed");
        context.runtimeSupervisor.nativeBackground = false;
      },
    },
    makeBrowserHost: () => ({ ready: async () => calls.push("ready"), destroy: options => {
      assert.equal(options.preserveControlDescriptor, true);
      calls.push("cleanup");
    } }),
    mainWindow: { hide: () => calls.push("hide") },
    showMainWindow: () => calls.push("show"), updateTrayMenu() {},
    publishOperation: event => calls.push(event.status),
  });
  vm.runInContext(source.slice(start, source.indexOf("async function requestQuit(", start)), context);
  return { calls, context, host };
}

test("background transition releases Web views without quitting or restoring the route", async () => {
  const { calls, context } = fixture();
  await context.enterNativeBackground();
  assert.equal(context.nativeBackground, true);
  assert.equal(context.browserHost, null);
  assert.equal(context.backgroundTransition, null);
  assert.deepEqual(calls, ["running", "persist", "pause", "destroy", "hide", "completed"]);
  await context.restoreWebWorkspace();
  assert.equal(context.nativeBackground, false);
  assert.deepEqual(calls.slice(-5), ["running", "ready", "resume", "show", "completed"]);
});

test("failed pause keeps the Web host and window usable", async () => {
  const { calls, context, host } = fixture("pause");
  await context.enterNativeBackground();
  assert.equal(context.nativeBackground, false);
  assert.equal(context.browserHost, host);
  assert.equal(context.backgroundTransition, null);
  assert.ok(!calls.includes("destroy"));
  assert.ok(!calls.includes("hide"));
  assert.equal(calls.at(-1), "failed");
});

test("failed Web resume cleans the new browser and preserves native-only mode", async () => {
  const { context, calls } = fixture("resume");
  await context.enterNativeBackground();
  await context.restoreWebWorkspace();
  assert.equal(context.nativeBackground, true);
  assert.equal(context.browserHost, null);
  assert.equal(context.backgroundTransition, null);
  assert.ok(calls.includes("cleanup"));
  assert.equal(calls.at(-1), "failed");
});

test("descriptor cleanup failure rolls the runtime back to Web without hiding the UI", async () => {
  const { context, calls, host } = fixture("destroy");
  await context.enterNativeBackground();
  assert.equal(context.nativeBackground, false);
  assert.equal(context.runtimeSupervisor.nativeBackground, false);
  assert.equal(context.browserHost, host);
  assert.ok(calls.includes("resume"));
  assert.ok(!calls.includes("hide"));
  assert.equal(calls.at(-1), "failed");
});

test("active Web operations prevent background changes", async () => {
  const { context, calls } = fixture();
  context.browserHost.currentOperation = () => "login";
  await context.enterNativeBackground();
  assert.deepEqual(calls, ["running", "failed"]);
  assert.equal(context.nativeBackground, false);
});

test("releasing Web views retains only the owned native control descriptor", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "native-control-descriptor-"));
  const descriptorPath = path.join(directory, "browser.json");
  const control = { endpoint: "http://127.0.0.1:12345", token: "fixture-not-a-real-token" };
  const host = Object.assign(Object.create(BrowserHost.prototype), {
    descriptorPath, shellZoomShortcutBindings: new Map(), turnTabs: new Map(),
    window: { off() {} }, view: { webContents: { isDestroyed: () => true } },
    clearHomeNavigationTimeout() {}, closeAuthView() {}, powerSaveBlockerId: null,
  });
  try {
    fs.writeFileSync(descriptorPath, JSON.stringify({ pid: process.pid + 1, control, surfaceTargets: { old: "target" } }));
    assert.throws(() => host.destroy({ preserveControlDescriptor: true }), /ownership changed/);
    assert.notEqual(host.destroyed, true);
    fs.writeFileSync(descriptorPath, JSON.stringify({ pid: process.pid, control, surfaceTargets: { old: "target" } }));
    host.destroy({ preserveControlDescriptor: true });
    const retained = JSON.parse(fs.readFileSync(descriptorPath, "utf8"));
    assert.deepEqual(retained.control, control);
    assert.deepEqual(retained.surfaceTargets, {});
    assert.equal(host.destroyed, true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
