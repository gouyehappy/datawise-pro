# DataWise Frontend

Vue 3 + TypeScript 客户端 — 浏览器联调与 JCEF 桌面壳共用同一套 UI。

包名 `datawise-cli` · 版本 **5.0.0** · 依赖同仓 [`@datawise/sql-editor`](../sql-editor/)（源码引用）

---

## 做什么

| 区域 | 能力 |
|------|------|
| **Explorer** | 连接树、库表对象、脚本；Redis / Kafka / YARN / SSH |
| **Workspace** | SQL 控制台 Tab、结果网格、书签、会话与事务 |
| **AI** | 对话分析、Text-to-SQL、画布与报告 |
| **Platform** | 联邦视图、漂移监控、数据质量、定时任务 |
| **Team / Settings** | 共享与审批、插件中心、主题与偏好 |
| **Desktop** | 内嵌后端 + JRE、自动更新、Deep Link |

技术栈：Vue 3 · Pinia · Vite · Monaco · vue-i18n · ECharts · xterm · JCEF · Playwright

---

## 快速开始

**日常命令请优先用仓库根目录**（只有几条：清理 / 前后端打包 / 插件 / 全部 / 桌面包 / 联调）：

```bash
cd ..   # 仓库根
npm run help
npm run dev
```

详见 [../scripts/README.md](../scripts/README.md)。Cursor：`Terminal → Run Task…` 可选中文任务名。

**仅前端 Web 联调：** 本机已启动后端（默认 `http://localhost:18421`），见 [../datawise-backend/README.md](../datawise-backend/README.md)。

```bash
cd datawise-frontend
cp .env.development.example .env.development   # 首次
npm install
npm run dev          # http://localhost:28413
```

| 本目录脚本 | 说明 |
|------|------|
| `npm run dev` | 仅 Vite Web |
| `npm run dev:all` | 一键起后端 + Vite + JCEF（根目录 `npm run dev` 同效） |
| `npm run stop:dev` | 停止联调 |
| `npm run typecheck` / `test` | 类型检查 / 单测 |
| `npm run dist:desktop` | 桌面打包（根目录 `npm run dist` 同效） |

端口约定见 [`runtime-ports.json`](./runtime-ports.json)：

| 场景 | 前端 | 后端 |
|------|------|------|
| 开发 Web | `28413` | `18421` |
| 桌面内嵌 | — | `18423` |

环境变量与联调细节：[../docs/README.md](../docs/README.md)

---

## 桌面打包（JCEF · Win / Mac / Linux）

需要 `JAVA_HOME`（JDK 17+）与 Maven。在**目标操作系统**上执行：

- 解压目录：`datawise-desktop/dist/{windows|linux|macos}/`
- 发布 zip：`datawise-frontend/release/DataWiseCLI-{version}-{os}-{arch}.zip`

```bash
npm run dist:desktop        # core 配置档 + zip（Windows 另产 Setup.exe，需 WiX）
npm run dist:desktop:slim   # 无 JRE / 无连接器 JAR
npm run dist:desktop:full   # 全连接器 + 完整 JRE
npm run pack:desktop        # 仅 unpacked，便于试跑
npm run prepare:desktop     # 只组装后端资源 → resources/desktop/
```

Windows **安装程序**（`DataWiseCLI-*-windows-x64-setup.exe`）需要本机 WiX 3.x：

```bash
winget install --id WiXToolset.WiXToolset -e
```

跳过安装包：`npm run dist:desktop -- --no-installer`

产品壳仅为 **JCEF**。Windows `Setup.exe` 由 Inno Setup 生成。

| 平台文档 | 链接 |
|----------|------|
| JCEF 宿主 | [../datawise-desktop/README.md](../datawise-desktop/README.md) |
| 后端捆绑脚本 | [scripts/desktop/README.md](./scripts/desktop/README.md) |
| macOS | [../docs/DESKTOP_PACKAGING.md#macos](../docs/DESKTOP_PACKAGING.md#macos) |
| Linux | [../docs/DESKTOP_PACKAGING.md#linux](../docs/DESKTOP_PACKAGING.md#linux) |
| 图标 | [build/README.md](./build/README.md) |

**用户配置目录**

| 形态 | 路径 |
|------|------|
| 便携版 | 安装根目录旁 `config/` / `user-data` |
| Windows | `%APPDATA%\DataWiseCLI\` |
| macOS | `~/Library/Application Support/DataWiseCLI/` |
| Linux | `~/.config/DataWiseCLI/` |

---

## 目录提示

```
src/features/     # ai · explorer · workspace · platform · team · settings …
src/__tests__/    # 单元 / 回归
e2e/              # Playwright
scripts/desktop/  # 桌面打包 / jpackage 辅助脚本
resources/        # 桌面种子配置、内嵌资源
```

更多产品说明见仓库根 [README.zh-CN.md](../README.zh-CN.md) 与 [使用说明书](../docs/user-manual/)。
