const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright-core");
const { createStateStore } = require("../electron/state.cjs");

async function main() {
  const root = path.resolve(__dirname, "..");
  const output = path.join(root, "artifacts", "turkish-ui");
  fs.mkdirSync(output, { recursive: true });
  const { preview } = await import(pathToFileURL(require.resolve("vite")).href);
  const server = await preview({ root, preview: { host: "127.0.0.1", port: 0 } });
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const viewport of [{ width: 1280, height: 900 }, { width: 800, height: 700 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(({ defaults, version }) => {
        let state = { ...defaults, language: "tr", onboardingComplete: true,
          sessionRefreshReminderAt: "2099-01-01T00:00:00Z" };
        let onState = () => {};
        const snapshot = { profile: "production", platform: "win32", packaged: false,
          version, profilePaths: { coreHome: "fixture", codexHome: "fixture", userData: "fixture" },
          connectorName: "Codex Native2", connectorNames: { automatic: "Codex Native2", manual: "Codex Zero Risk" },
          mcpCredentialsConfigured: false, browser: null, logs: [], operation: null,
          update: { status: "up-to-date" }, smokePassed: false, urls: {} };
        window.codexWebLauncher = {
          snapshot: async () => ({ ...snapshot, state }),
          getLimits: async () => ({ enabled: false, plan: null, trackingSince: null, checkedAt: null,
            totalMessages: 0, unknownProMessages: 0, incomplete: false, windows: [] }),
          onStateChanged: callback => { onState = callback; return () => {}; },
          setLanguage: async language => { state = { ...state, language }; onState(state); return state; },
          onConnectorNamesChanged: () => () => {}, onBrowserState: () => () => {},
          onOperation: () => () => {}, onLog: () => () => {}, onUpdateState: () => () => {},
          onWindowStateChanged: () => () => {},
          windowState: async () => ({ maximized: false, fullScreen: false }),
          setBrowserSurfaceActive: async () => null, setBrowserBounds: async () => true,
          setSidebarState: async next => { state = { ...state, sidebarOpen: next.open, sidebarWidth: next.width }; return state; },
        };
      }, { defaults: createStateStore(path.join(output, "absent-fixture-state.json")).read(), version: require("../package.json").version });
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
      await page.locator('.app-root[data-language="tr"]').waitFor();
      const openSidebar = async () => {
        await page.screenshot({ path: path.join(output, `navigation-${viewport.width}.png`) });
        const button = page.getByRole("button", { name: "Kenar çubuğunu göster", exact: true });
        if (await button.isVisible()) await button.click();
      };
      for (const [navigation, heading, name] of [
        ["Ayarlar", "Başlatıcı ayarları", "settings"],
        ["Kurulum", "Codex Web GPT kurulumu", "setup"],
        ["Kullanım sınırları", "Kullanım sınırları", "limits"],
      ]) {
        await openSidebar();
        await page.getByRole("button", { name: navigation, exact: true }).click();
        await page.getByRole("heading", { name: heading, exact: true }).waitFor();
        assert.equal(await page.locator("html").getAttribute("lang"), "tr");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(output, `${name}-${viewport.width}.png`), fullPage: true });
      }
      await openSidebar();
      await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
      await page.getByRole("heading", { name: "Başlatıcı ayarları" }).waitFor();
      await page.getByRole("button", { name: "Türkçe", exact: true }).click();
      await page.getByRole("option", { name: "English" }).click();
      await page.getByRole("heading", { name: "Launcher settings" }).waitFor();
      assert.equal(await page.locator("html").getAttribute("lang"), "en");
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("TURKISH_RENDERER_SMOKE_OK settings/setup/limits 1280/800 English switch; fixture IPC, no account requests");
  } finally {
    await browser?.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
