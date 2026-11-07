# Desktop packaging scripts

Backend / connector bundling for the desktop app lives under `datawise-frontend/scripts/desktop/`.
The installer/zip layout is built by [`datawise-desktop/scripts/build-desktop.mjs`](../../../datawise-desktop/scripts/build-desktop.mjs).

Packaged model: **one JVM** (`datawise-server` + desktop UI on the classpath) with **`jbr_jcef`** as jpackage `--runtime-image`.

Dev: `npm run dev` (repo root) → Vite + same-JVM `spring-boot:run` + JCEF. Legacy dual-process: `npm run dev -- --dual`.

| Host OS | Default artifact |
|---------|------------------|
| Windows | Zip + Setup.exe (`jpackage` + WiX) — [datawise-desktop/README.md](../../../datawise-desktop/README.md) |
| macOS | Zip + DMG — [桌面打包 · macOS](../../../docs/DESKTOP_PACKAGING.md#macos) |
| Linux | Zip + deb (`fakeroot`) — [桌面打包 · Linux](../../../docs/DESKTOP_PACKAGING.md#linux) |

打包前会先 `mvn install` **datawise-desktop**（JetBrains JCEF），再构建带 `desktop` profile 的 `datawise-server`（产物在 `target/`）。

---

## npm 命令

在 `datawise-frontend` 下执行。前置：`JAVA_HOME`（JDK 17+ 含 `jpackage`）、Maven、已 `npm install`、可访问 JetBrains JBR 下载源。

| 命令 | 说明 |
|------|------|
| `npm run dist:desktop` | 当前系统全量构建（默认 **`core`** 连接器配置档） |
| `npm run dist:desktop:slim` | 瘦包：无连接器 JAR |
| `npm run dist:desktop:full` | 全连接器 |
| `npm run dist:desktop:mac` | macOS 别名（**须在 Mac 上跑**） |
| `npm run dist:desktop:linux` | Linux 别名（**须在 Linux 上跑**） |
| `npm run pack:desktop` | 仅 unpacked 目录，便于试跑 |
| `npm run prepare:desktop` | 只组装后端 → `resources/desktop/` |
| `npm run build:backend` | 仅 Maven → `target/` |
| `npm run clean:desktop` | 清前端打包产物 + 全部 `target/` |
| `npm run stop:desktop` | 结束正在运行的 DataWise |

产物：

- `datawise-frontend/release/DataWiseCLI-*-{windows\|linux\|macos}-*.zip`
- Windows：`DataWiseCLI-*-windows-x64-setup.exe`（需 WiX 3.x）
- macOS：`DataWiseCLI-*-macos-{arm64\|x64}.dmg`
- Linux：`DataWiseCLI-*-linux-{x64\|arm64}.deb`（需 `fakeroot`）

运行时由 **`jbr_jcef`** 提供（构建时下载并作为 `--runtime-image`），**不再**在 `backend/jre` 下放第二份 JRE。

桌面后端 JAR（`-Ddatawise.desktop.packaging=true`）会去掉 Tika/Office/PDF 解析栈、Swagger UI、Prometheus 等运维依赖。

跳过安装包：`npm run dist:desktop -- --no-installer`。三端安装包须在对应 OS（或 `desktop-release` CI）上构建，不可交叉打包。

---

## Profiles

| Profile | Connectors | Typical use | Artifact name |
|---------|------------|-------------|---------------|
| `slim` | no | smallest; catalog only | `…-{ver}-slim-{os}-{arch}.zip` |
| `core` (default) | mysql / postgresql / sqlite (Standard free) | recommended release | `…-{ver}-{os}-{arch}.zip`（无 profile 段） |
| `full` | all in-tree | offline / air-gapped | `…-{ver}-full-{os}-{arch}.zip` |

体积台账（打包后自动写出，也可单独跑）：

```bash
npm run size-report:desktop -- --dir ../datawise-desktop/dist/windows
# → datawise-frontend/release/size-report-{profile}.json
```

发版冒烟（台账 + zip/layout；`dist:desktop` 成功后自动跑）：

```bash
npm run release-smoke:desktop -- --report release/size-report-core.json --layout ../datawise-desktop/dist/windows
```

Checklist：[DESKTOP_RELEASE_CHECKLIST.md](../../../_private/docs/design/DESKTOP_RELEASE_CHECKLIST.md)  
详见 [DESKTOP_PACKAGING.md](../../../docs/DESKTOP_PACKAGING.md) 与 [PRODUCT_OPTIMIZATION_BACKLOG.md](../../../_private/docs/design/PRODUCT_OPTIMIZATION_BACKLOG.md)。
