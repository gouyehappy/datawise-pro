# datawise-desktop (JetBrains JCEF)

**Shipping desktop shell** for DataWise CLI. The product host is **JCEF only**.

Desktop UI module for Windows / macOS / Linux. When packaged, it runs **in the same JVM** as Spring Boot (`datawise-server`), using **JetBrains Runtime with JCEF** (`jbr_jcef`) as the jpackage `--runtime-image`.

Vue talks to the local API over HTTP/WS on `127.0.0.1` (same origin in packaged mode).

Windows `Setup.exe` is **Inno Setup** ([`installer/windows/DataWiseCLI.iss`](installer/windows/DataWiseCLI.iss)).

## Feature parity

| Area | Status |
|------|--------|
| JCEF window + frameless chrome | Done (macOS uses system chrome) |
| `__datawiseDesktopBridge` (terminal via `/ws/terminal`) | Done |
| Same-JVM Spring Boot + health wait | Done |
| Dual-process host (`DatawiseDesktopApp`) | Dev/legacy optional |
| In-app splash / tray / icons / window state | Done |
| Workspace switch relaunch | Done |
| Updater (GitHub Releases) | Done — FE / server-jar incremental + full installer fallback |
| Zip + native installers | Done |
| Native Edit menu + clipboard | Done (`DesktopMenuBar`) |
| CEF focus after modals | Done |
| macOS Desktop quit / open file / Dock | Done (`DesktopIntegration`) |
| DevTools (F12, dev default) | Done — `DATAWISE_CEF_DEVTOOLS=1` |
| FlatLaf (Win/Linux) | Done — `DesktopLookAndFeel` |
| fs / zoom / clipboard / theme bridge | Done — see `DesktopBridgeScript` |
| Post-package layout validation | Done — `build-desktop.mjs` |
| macOS notarization | Scaffold ready — needs Apple credentials (`notarize-*.sh`) |

## Quick start (dev)

Terminal 1 — full stack (recommended):

```bash
# repo root — Vite + same-JVM Spring Boot + JCEF (downloads jbr_jcef on first run)
npm run dev
# legacy dual-process:
npm run dev -- --dual
```

Or split terminals — Vite:

```bash
cd datawise-frontend && npm run dev
```

Desktop (same JVM):

```bash
cd datawise-frontend && npm run dev:jcef
# dual-process host:
cd datawise-frontend && npm run dev:jcef:dual
```

## Packaged build

From `datawise-frontend` **on the target OS**:

```bash
npm run dist:desktop
# → downloads jbr_jcef, jpackages datawise-server.jar as the app entry
# → Windows Setup.exe via Inno Setup
# → datawise-desktop/dist/{windows|linux|macos}/
# → datawise-frontend/release/DataWiseCLI-{version}-{os}-{arch}.zip (+ installer)
```

Skip installer: `npm run dist:desktop -- --no-installer`.
WiX only if explicitly requested: `npm run dist:desktop -- --installer=wix`.

Windows installer details: [installer/windows/README.md](installer/windows/README.md).

**Cross-packaging is not supported** — build each OS on that OS (or `.github/workflows/desktop-release.yml`).

### Requirements

- Build machine: JDK 17+ with `jpackage`, Maven, Node, network to download `jbr_jcef`
- Windows installer: Inno Setup (downloaded by `ensure-inno-setup.mjs` when missing)
- Linux deb: `fakeroot` + `binutils`
- End users: no separate JDK — runtime is embedded `jbr_jcef`

## Environment overrides

| Variable | Meaning |
|----------|---------|
| `DATAWISE_GUI` / `-Ddatawise.gui=true` | Start JCEF UI in-process |
| `DATAWISE_PACKAGED` / `-Ddatawise.packaged=true` | Packaged mode (implies GUI unless gui=false) |
| `DATAWISE_RENDERER_URL` | Force UI URL (dev: Vite) |
| `DATAWISE_API_BASE_URL` | Force API base |
| `DATAWISE_INSTALL_ROOT` | Install root |
| `DATAWISE_USER_DATA` | Override user-data directory |
| `DATAWISE_CEF_ENABLE_GPU=1` | Force-enable GPU (wins over DISABLE) |
| `DATAWISE_CEF_DISABLE_GPU=1` | Force disable GPU (default is on; disabling may cause Alt+Tab tree flicker on Windows) |
| `DATAWISE_CEF_LOG=1` | Verbose CEF log |
| `DATAWISE_CEF_DEVTOOLS=1` | Force DevTools (F12 / Ctrl+Shift+I; separate window on Win/Linux) |
| `DATAWISE_CEF_DEVTOOLS=0` | Disable DevTools even in dev |

## Bridge contract

Source of truth: `DesktopBridgeScript` (injected into the JCEF page as `__datawiseDesktopBridge` / `window.datawise`).
Terminal I/O uses WebSocket (`/ws/terminal`), not a native host PTY bridge.
