# Community plugins

Third-party extensions packaged as `.dwp`.

## Docs (read in this order)

| Doc | Audience | Content |
|-----|----------|---------|
| [`AGENTS.md`](./AGENTS.md) | **AI 代理 / 快速上手** | **执行入口** — 决策树选模板 + 9 步任务卡(含 DoD)+ 红线 + 自查命令 |
| [`docs/PLUGIN_BRIEF_TEMPLATE.md`](./docs/PLUGIN_BRIEF_TEMPLATE.md) | 插件需求方 | **填空式 Brief** — 填好交给代理即开工 |
| [`scripts/verify-plugin.mjs`](./scripts/verify-plugin.mjs) | 代理 / CI | **机器自查** — `node verify-plugin.mjs <插件目录>`,不合规退出码 1 |
| [`_private/docs/design/COMMUNITY_PLUGIN.md#platform`](../_private/docs/design/COMMUNITY_PLUGIN.md#platform) | Host + plugin authors | **Protocol only** — package, manifest, contributions, Host↔Plugin RPC, `datawisePlugin`, transport, permissions |
| [`_private/docs/design/COMMUNITY_PLUGIN.md#implementation`](../_private/docs/design/COMMUNITY_PLUGIN.md#implementation) | Plugin authors | **How to implement** against that protocol |
| [`_private/docs/design/COMMUNITY_PLUGIN_DEV_PLAYBOOK.md`](../_private/docs/design/COMMUNITY_PLUGIN_DEV_PLAYBOOK.md) | Plugin authors | **End-to-end playbook** — 选型→脚手架→manifest→sidecar→前端工作台→打包签名→安装调试→验收(含前端完整规范) |

## Examples

| Path | Notes |
|------|--------|
| `examples/hello-workbench` | Minimal connection + workbench + stateless `hello:/` FS |
| `ssh` | Session-bound workbench + SFTP (`sessionBound`) |
| `http-client` | Postman-style HTTP workbench (Go sidecar, `stdio-jsonl`) |
| `kubernetes` | Full-tree port of eryajf/dbx-plugin-k8s (Go + React; gradual DataWise adaptation like `ssh`) |
| `kibana` | Discover-style log workbench (React + EUI, OSD/Kibana layout); Go sidecar → ES via Kibana |
| `docker` | Docker Engine connection + workbench (containers / images / compose) |
| `log-controller` | Multi-host log merge search over SSH/SFTP |
| `files-studio` | Local + OpenDAL (S3 / WebDAV / FTP / SFTP) file workbench |
| [`dbt`](./dbt/README.md) | **官方示范** — 绑定本机 dbt 项目：列出 / 编译 / 运行 model，并把 SQL 打开到已有控制台。用法见该目录 README |
| [`duckdb`](./duckdb/README.md) | **官方示范** — 对 DuckDB 文件或 Parquet/CSV 目录做即席 SQL。用法见该目录 README |
| [`data-diff`](./data-diff/README.md) | **官方示范** — 用已有 SQL 连接对比两个环境的行数和主键抽样。用法见该目录 README |
| [`redis-ops`](./redis-ops/README.md) | Redis 运维台：单机 / Sentinel / Cluster / 舰队；概览自动刷新、Keys（含 ZSet/Stream / 批量删除）、Config 白名单 SET、受控控制台 |
| [`kafka-ops`](./kafka-ops/README.md) | Kafka 运维台：Bootstrap / 多集群舰队；Pulse · Topics · Explore · Lag · Brokers · Guard（流域 IA，非 Redis 翻版） |
| [`nacos-ops`](./nacos-ops/README.md) | Nacos / rNacos 运维台：配置发布、服务发现（Go + React；与 connector-nacos 并存） |
| [`polaris-ops`](./polaris-ops/README.md) | PolarIS 运维台：配置更新发布、服务发现（Go + React；与 connector-polaris 并存） |
| [`runbook`](./runbook/README.md) | YAML 运维剧本：说明、复制命令、SQL 控制台、HTTP、检查清单 |
| [`health-check`](./health-check/README.md) | 值班巡检：TCP / HTTP / 只读 SQL，结果可复制 |
| [`git-ops`](./git-ops/README.md) | 超越 SourceTree：块级暂存 · 勾选暂存 · 提交并推送 · 键盘优先 · 宿主配色 |

## Marketplace catalog (built-in store)

The host ships a built-in store list from
[`datawise-backend/datawise-server/src/main/resources/community-plugin-catalog.json`](../datawise-backend/datawise-server/src/main/resources/community-plugin-catalog.json).

| Catalog | Contents | Package source |
|---------|----------|----------------|
| `datawise-examples` | Hello Workbench | `classpath:community-plugin-fixtures/…` (signed fixture in the server jar) |
| `datawise-community` | All plugins under this folder (ssh, git-ops, …) | GitHub Release HTTPS URL for a **signed** `.dwp` |

**Do not** copy community `.dwp` binaries into `community-plugin-fixtures/` (they are ~200 MB total).

### Regenerate after manifest / version bumps

```bash
node community-plugins/scripts/generate-marketplace-catalog.mjs
node community-plugins/scripts/generate-marketplace-catalog.mjs --check   # CI / drift guard
```

Release asset naming (must match catalog `packageUrl`):

```text
tag:    community-plugin-<dir>-v<version>
        e.g. community-plugin-ssh-v0.7.9-beta.2
asset:  <id>-<version>[-windows-x86_64]-signed.dwp
        e.g. io.datawise.community.ssh-0.7.9-beta.2-windows-x86_64-signed.dwp
```

Repo slug comes from `DATAWISE_GITHUB_REPO` / `repo.meta.json` (see `scripts/repo-identity.mjs`). Native plugins currently list the **windows-x86_64** artifact only.

### Trust key (`datawise-community`)

Store installs always require a signed package and a matching trust key.

1. `npm run plugin:keygen -- datawise-community` (keep private key offline)
2. Publish `*-signed.dwp` to the Release tag above
3. Users (or product) add the public key in **Community plugins → Settings → 信任公钥** (`id=datawise-community`)

There is **no** seeded `datawise-community` classpath trust fixture yet (unlike `datawise-examples` for Hello). Until Release assets + the public key are published, store rows still appear; install will fail on download or signature check.

## Rule

Host defines **protocol / capability classes** only.

- Display strings (name, field labels, options, descriptions) come from the **plugin manifest** inside the `.dwp`.
- The host must **not** ship per-`pluginId` i18n catalogs, hard-coded RPC names, or `if (pluginId === …)` branches.
- If a capability is missing, extend **hostApi / permissions / contribution fields** (generic), then plugins opt in.

A third-party `.dwp` must install and run without any host source change that names that plugin.

## Theme (light / dark — follow the host)

The host is the **only** source of truth for workbench appearance. See [`COMMUNITY_PLUGIN.md` §4.1](../_private/docs/design/COMMUNITY_PLUGIN.md) (`HostInfo.theme` / `appearance`).

**Do:**

1. Style surfaces with host tokens (`--color-background`, `--color-foreground`, `--color-muted`, `--color-border`, `--color-primary`, …). Local hex values are fallbacks only (match `PLUGIN_WORKBENCH_PALETTE`).
2. Rely on bootstrap writing `data-theme` / `data-dw-theme` / `color-scheme` and injecting tokens; for editors / terminals / EUI, also subscribe to `onAppearanceChange` or `datawise-plugin-env`.
3. Add `:root[data-theme="light"], :root[data-dw-theme="light"]` only for extras tokens cannot cover (scrollbars, decorative glows, brand soft fills).

**Don’t:**

- Hard-code `color-scheme: dark` (or light-only) with opaque hex backgrounds that ignore host tokens.
- Override the host with plugin `localStorage` / `prefers-color-scheme` when `window.datawisePlugin` is present.
- Expect SPA `--dw-*` chrome tokens inside the iframe (plugins use `--color-*`).

**Smoke check:** open the workbench, toggle host Settings appearance — chrome should flip without reloading the iframe.

Reference implementations: `http-client` (`ui/bridge.js` + `ui/app.css`), `ssh` (`themeSync.ts`), `kubernetes` (`syncHostAppearance`), `docker` (`src/style.css`).
