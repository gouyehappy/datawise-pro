# Docker for DataWise

`io.datawise.community.docker` adds a Docker Engine connection and workbench to DataWise.

Ported from [Ezreal-byte/dbx-docker-plugin](https://github.com/Ezreal-byte/dbx-docker-plugin) (Apache-2.0). The backend is a Go sidecar using the Docker SDK over `stdio-framed` + `host.binary`; the UI is a Vue workbench packaged into a `.dwp` file.

## Features

Containers, images, volumes, networks; lifecycle and create; rename; image pull/push/export/tag/history; live logs; resource charts; container file browse/upload/download; interactive terminal; disk usage + prune preview; controlled Compose YAML apply.

## Requirements

- DataWise `>=4.1.0`, Host API `^1.3`
- Reachable Docker Engine (HTTP/HTTPS, Unix socket, or Unix-over-SSH `nc`)
- Permissions: `host.workbench`, `host.events`, `host.binary`, `host.clipboard`

## Build

Requires Node.js 20+ and Go 1.24+.

```powershell
cd community-plugins/docker
npm ci --ignore-scripts
npm test
go -C backend test ./...
go -C backend/sdk test ./...
node package.mjs
```

Output: `dist/io.datawise.community.docker-<version>-<os-arch>.dwp`.

Install in DataWise: Community plugins → allow unsigned development packages → install the `.dwp`.

## Protocol notes

- Manifest: `manifest.datawise.json` (packaged as `manifest.json`)
- Bridge: `window.datawisePlugin` only
- Transport: `stdio-framed` (binary channels `docker-log`, `docker-transfer`, `docker-exec`, `docker-file`)
- Connection secrets use `binding: "secret"` → `connection_secrets`; config fields → `external_config`
- Host tunnels arrive as `runtime.host` / `runtime.port`

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
