# HTTP Client (community plugin)

Postman-style HTTP workbench for DataWise: compose requests, send them through a
native Go sidecar, inspect responses, and manage collections / environments / history.
Implements the DataWise community plugin protocol
([`_private/docs/design/COMMUNITY_PLUGIN.md`](../../_private/docs/design/COMMUNITY_PLUGIN.md)).

| | |
|---|---|
| Plugin id | `io.datawise.community.httpclient` |
| Contributions | `connection-provider` + `workbench` |
| Transport | `stdio-jsonl` |
| Permissions | `host.workbench`, `host.events`, `host.clipboard` |

## Requirements

- Go ≥ 1.22 (to build the sidecar)
- Node.js (to run `package.mjs`)
- DataWise host with community plugins enabled

## Package

```bash
# Unsigned (dev; requires allow-unsigned on the host)
node community-plugins/http-client/package.mjs

# Signed
npm run plugin:keygen -- datawise-community
# save JSON to community-plugins/http-client/.signing/keys.json (gitignored)
node community-plugins/http-client/package.mjs --sign-key-file .signing/keys.json
```

Output (current OS/arch):

```text
community-plugins/http-client/dist/io.datawise.community.httpclient-0.1.0-<os-arch>.dwp
community-plugins/http-client/dist/io.datawise.community.httpclient-0.1.0-<os-arch>-signed.dwp
```

### Sign / trust (no allow-unsigned needed)

1. `npm run plugin:keygen -- datawise-community` → keep `privateKeyBase64` local only  
2. Community plugins → Settings → **信任公钥** → add `id=datawise-community` + `publicKeyBase64`  
3. Build with `--sign-key-file .signing/keys.json` (or `--sign-key-id` + `--sign-private-key-file`)  
4. Install the `*-signed.dwp` path  

`.signing/` is gitignored. Never commit private keys.

## Install

### Signed (recommended)

1. Add trust key (see Package → Sign / trust above)
2. Install `dist/…-signed.dwp` (path paste or drop)

### Unsigned (local only)

1. Server: `datawise.community-plugin.allow-unsigned=true` (`dev` / `desktop` profiles already set)
2. Community plugins → Settings → enable **Allow unsigned development packages**
3. Install the unsigned `.dwp`

Then: 新建连接 → **Plugins** → **HTTP Client** → 打开工作台。

## Import ApiPost

集合或环境侧栏 → **一键导入**：选择或粘贴 ApiPost「项目设置 → 导出项目 → Apipost 格式」JSON。

一次写入：`apis` 目录树（method·url·query·header·body·auth）+ `env`/`envs` 环境（`pre_url`→`baseUrl`）+ 请求前置/后置脚本到「执行操作」。同名环境会覆盖变量。

「执行操作」支持最小 `pm`/`apt` API：`environment.set/get`、`test`、`expect`、`response.code|json|text`。

## Develop

```bash
cd community-plugins/http-client/backend
go test ./...
go build -o datawise-plugin-http-client.exe .
python ../tools/sidecar-smoke-test.py ./datawise-plugin-http-client.exe
```

UI is static (`ui/`); refresh the workbench iframe after edits. Sidecar changes need a rebuild + reinstall (or restart the plugin session).

## Layout

```text
http-client/
├── manifest.datawise.json
├── package.mjs
├── assets/
├── ui/                 # sandbox workbench (datawisePlugin + host theme tokens)
├── backend/            # Go sidecar + internal/rpc
├── tools/              # smoke / e2e (not packaged)
├── LICENSE / NOTICE
└── dist/               # .dwp output
```

UI chrome follows the DataWise community workbench palette (`--color-*` /
`--font-*` / `--dw-primary` injected by the host). Rebuild/reinstall the `.dwp`
(or hard-refresh an already-installed UI) after `ui/` edits.
