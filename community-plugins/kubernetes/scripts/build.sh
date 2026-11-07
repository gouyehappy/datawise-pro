#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
export GOCACHE="${GOCACHE:-${TMPDIR:-/tmp}/datawise-plugin-kubernetes-gocache}"
export PATH="${HOME}/.nvm/versions/node/v22.21.1/bin:${PATH}"

cd "$ROOT/backend"
go test -mod=readonly ./...
go build -o "$ROOT/.datawise-dev/bin/datawise-plugin-kubernetes" .
cd "$ROOT/ui"
pnpm run build
echo "Build completed"
