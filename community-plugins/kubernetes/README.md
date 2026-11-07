# Kubernetes Manager (DataWise community plugin)

Full-tree port of [eryajf/dbx-plugin-k8s](https://github.com/eryajf/dbx-plugin-k8s) into DataWise `.dwp`, following the same gradual-adaptation approach as `community-plugins/ssh`.

| | |
|---|---|
| Plugin id | `io.datawise.community.kubernetes` |
| Upstream | eryajf/dbx-plugin-k8s `0.1.7` (Apache-2.0) |
| Transport | `stdio-jsonl` (session streaming may move to framed later) |

## Conversion status

| Layer | Status |
|-------|--------|
| Source tree | Full copy of upstream |
| Backend RPC | Upstream SDK → local DataWise `internal/rpc` (stdio-jsonl) |
| Manifest | `manifest.datawise.json` (+ upstream `manifest.json` kept for reference) |
| UI host bridge | `datawisePlugin` via `ui/src/lib/host-bridge.ts` |
| Packaging | `package.mjs` → `.dwp` |
| Rename / cleanup | Incremental (ids, i18n strings, file names) |

## Build

Requires Go ≥ 1.22, Node, pnpm.

```bash
cd community-plugins/kubernetes
node package.mjs
# or
node package.mjs --skip-frontend   # reuse ui/dist
node package.mjs --skip-backend    # reuse built sidecar
```

Install unsigned `.dwp` from `dist/` with Community plugins → allow unsigned.

## Develop

```bash
cd backend && go test ./... && go build -o datawise-plugin-kubernetes.exe .
cd ../ui && pnpm install && pnpm run build
```
