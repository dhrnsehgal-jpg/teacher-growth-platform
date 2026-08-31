---
name: Playwright on Nix
description: Environment requirements for running Playwright Chromium tests in this workspace
---

Playwright Chromium tests require both the downloaded browser binary and native Linux runtime libraries in the Nix environment.

**Why:** A fresh workspace can have the Playwright package installed while Chromium launch still fails because shared libraries such as GLib or GBM are absent.

**How to apply:** When a browser executable or shared-library error appears, install the Playwright browser and supported Nix runtime dependencies before debugging the test or application. Keep those environment changes separate from task code unless the project explicitly needs them persisted.

In this workspace, installing the browser plus `glib`, `libgbm`, and
`libxkbcommon` was needed before headless Chromium could launch; installing
`mesa` alone did not provide the explicit GBM library.
