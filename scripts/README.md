# 仓库脚本

## 常用命令（推荐）

在**仓库根目录**执行（`npm run` 只保留这几条）：

| 命令 | 含义 |
|------|------|
| `npm run clean` | 项目清理 |
| `npm run frontend` | 前端编译打包（全量 / 桌面 Vite） |
| `npm run frontend:standard` | **标准版**前端打包（付费入口 stub） |
| `npm run backend` | 后端编译打包（全量模块） |
| `npm run backend:standard` | **标准版**后端胖包（剥离 AI/迁移/备份等） |
| `npm run plugins` | 后端插件 → `config/plugins/` |
| `npm run all` | 全部（清理 + 后端 + 插件 + 前端 + 桌面包） |
| `npm run dist` | 桌面安装包（默认 **core**；当前系统 zip + Setup.exe / DMG / deb） |
| `npm run dist:slim` | 桌面瘦包（无连接器 JAR；按需安装） |
| `npm run dist:full` | 桌面全量包（全连接器；体积更大，**非默认发布**） |
| `npm run dist:publish` | 打包并上传 GitHub Releases（需 `GH_TOKEN`；默认 **core**） |
| （前端）`npm run size-report:desktop -- --dir <layout>` | 桌面体积台账 → `release/size-report-*.json` |
| `npm run dist -- --no-installer` | 只打 portable zip |
| `npm run dev` | 全量联调：Vite + 同 JVM（Spring Boot + JCEF）；`-- --dual` 旧双进程 |
| `npm run dev:standard` | **标准版**联调：前端 stub 付费能力；后端仍为本机全量服务 |
| `npm run stop` | 停止联调 |
| `npm run help` | 打印说明（含中文） |

Cursor / VS Code：`Terminal → Run Task…` 也有同名中文任务。

实现：[`scripts/dw.mjs`](./dw.mjs)。`datawise-frontend/package.json` 里仍有细粒度脚本（CI / 少用场景），日常不必记。

---

## 提交前检查

读取 `scripts/project-config.json`，实现位于 `scripts/sop/pre-commit-check.mjs`。

```bash
node scripts/pre-commit-check.mjs        # 默认检查
node scripts/pre-commit-check.mjs --test # 含测试
node scripts/pre-commit-check.mjs --full # 全量
```

---

## 本地前后端联调

推荐根目录：

```bash
npm run dev          # Vite + 同 JVM（Spring Boot + JetBrains JCEF / jbr_jcef）
npm run stop
npm run dev -- --dual   # 旧双进程：独立 spring-boot:run + DatawiseDesktopApp
```

等价于前端目录的 `dev:all` / `stop:dev`（→ `dev-start.mjs` / `dev-stop.mjs`）。

默认端口：前端 `28413` · 后端 `18421`。
首次会下载 `jbr_jcef` 到 `datawise-desktop/target/jbr-cache/`。

---

## OpenAPI 导出

后端已启动时：

```bash
node scripts/export-openapi.mjs
npm run gen:openapi-types
```

说明：[../docs/OPENAPI.md](../docs/OPENAPI.md)

---

## 品牌图标 path

从 `.tmp-icons/` 重新提取品牌 SVG path（少用）：

```bash
node scripts/extract-brand-icon-paths.mjs
```

---

## 桌面打包细节

根目录命令已覆盖日常场景。细粒度说明见 [`datawise-frontend/scripts/desktop/README.md`](../datawise-frontend/scripts/desktop/README.md)。

产物：`datawise-frontend/release/DataWiseCLI-*`（zip + 当前系统安装程序）。三端需分别在对应 OS 或 CI（`desktop-release.yml`）上构建。
