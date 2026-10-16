# Jarvvis Local Fork

This fork preserves the Turkish launcher, visible-but-unavailable Web model catalog rows,
disabled-composer capability guard, and normal-Quit route restoration on top of upstream.
Current upstream base: v6.1.9. Changes are AI-assisted; see commit messages.

## Routing Lifecycle

After integration is installed, opening the launcher starts its runtime and recovers the
previously managed bridge route. Normal Quit restores the journal-recorded prior Codex
configuration before stopping that runtime. A failed ownership check does not overwrite
externally changed configuration. DEV remains isolated.

Close-to-tray is off by default in this fork. With that setting off, the window close
button runs normal Quit. If enabled deliberately, closing hides the window and keeps
the server and bridge route active; that is not a full exit.

Codex sessions can retain provider connections established before a configuration change.
Restoring a file cannot refresh those connections. A full Codex restart may still be
necessary; this launcher never kills or restarts Codex automatically. Force-kill, crash
and power-loss recovery are not guaranteed by the normal-Quit hook.

## Preserve Local Changes During Updates

The launcher package sets `codexWebGptCustomBuild=true`; its official upstream updater
is disabled. Settings identifies the build with `Jarvvis`. Do not replace this build with
an official installer if the local features must remain present.

For a new upstream release, merge its tag into the maintained fork branch, resolve any
new localization keys, run frozen installs and `bun run verify`, then build and test the
native package. Keep earlier release branches. Do not force-push or include configuration,
credentials, browser profiles, logs, or installation artifacts in source commits.
