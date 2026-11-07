.PHONY: test frontend build package dwp auto

test:
	cd backend && GOCACHE=$${GOCACHE:-/tmp/datawise-plugin-kubernetes-gocache} go test -mod=readonly ./...

frontend:
	cd ui && pnpm run build

build:
	./scripts/build.sh

package:
	node package.mjs

# Build the complete plugin and emit a local-platform .dwp candidate.
dwp: build
	node package.mjs

# Rebuild + repackage only when sources changed, bumping the patch version.
auto:
	node scripts/auto-package.mjs
