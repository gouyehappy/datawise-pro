# Docker for DataWise

`io.datawise.community.docker` adds a Docker Engine connection and workbench to DataWise.

Ported from [Ezreal-byte/dbx-docker-plugin](https://github.com/Ezreal-byte/dbx-docker-plugin) (Apache-2.0). The backend is a Go sidecar using the Docker SDK over `stdio-framed` + `host.binary`; the UI is a Vue workbench packaged into a `.dwp` file.

## Features

Containers, images, volumes, networks; lifecycle and create; rename; image pull/push/export/tag/history; live logs; resource charts; container file browse/upload/download; interactive terminal; disk usage + prune preview; controlled Compose YAML apply.

## Requirements

- DataWise `>=4.1.0`, Host API `^1.3`
- Reachable Docker Engine:
  - **Local (default)** — Windows named pipe / macOS·Linux `/var/run/docker.sock` (same as DBX docker plugin)
  - HTTP/HTTPS TCP, explicit Unix socket / Named Pipe, or Unix-over-SSH `nc`
- Permissions: `host.workbench`, `host.events`, `host.binary`, `host.clipboard`

> Windows Docker Desktop does **not** listen on `2375` by default. Prefer **Local** or **Named Pipe**
> (`//./pipe/docker_engine`, or `//./pipe/dockerDesktopLinuxEngine` for some Desktop contexts).

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

### Signed package

```powershell
# once — keep private key offline; never commit .signing/
npm run plugin:keygen -- datawise-community
# save JSON to community-plugins/docker/.signing/keys.json

node package.mjs --sign-key-file .signing/keys.json
```

Output: `dist/io.datawise.community.docker-<version>-<os-arch>-signed.dwp`.

## Install

### Local unsigned (dev)

1. DataWise → Community plugins → Settings → enable **Allow unsigned development packages**
2. Install path:

```text
community-plugins/docker/dist/io.datawise.community.docker-0.1.7-windows-x86_64.dwp
```

(`dev` / `desktop` profiles already set `datawise.community-plugin.allow-unsigned=true`.)

### Signed (recommended / store)

1. Trust public key: Community plugins → Settings → **信任公钥** → `id=datawise-community` + `publicKeyBase64`
2. Install the `*-signed.dwp` (path paste / drop), **or** use the built-in store after the GitHub Release exists

Store installs always use the signed policy; an unsigned local package cannot satisfy the marketplace download path.

## Publish (make the store installable)

Catalog URL (must match):

```text
tag:    community-plugin-docker-v0.1.0
asset:  io.datawise.community.docker-0.1.0-windows-x86_64-signed.dwp
url:    https://github.com/gouyehappy/datawise-cli/releases/download/community-plugin-docker-v0.1.0/<asset>
```

```powershell
cd community-plugins/docker
node package.mjs --sign-key-file .signing/keys.json
node scripts/publish-release.mjs --dry-run   # print tag / sha256 / URLs
node scripts/publish-release.mjs             # gh release create/upload
```

Then regenerate integrity fields if you have the signed artifact locally:

```powershell
node community-plugins/scripts/generate-marketplace-catalog.mjs
```

`publish-release.mjs` does **not** invent a key. Without `.signing/keys.json` (or the official `datawise-community` private key), only the unsigned local install path works.

## Protocol notes

- Manifest: `manifest.datawise.json` (packaged as `manifest.json`)
- Bridge: `window.datawisePlugin` only
- Transport: `stdio-framed` (binary channels `docker-log`, `docker-transfer`, `docker-exec`, `docker-file`)
- Connection secrets use `binding: "secret"` → `connection_secrets`; config fields → `external_config`
- Host tunnels arrive as `runtime.host` / `runtime.port`

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
