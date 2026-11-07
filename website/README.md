# DataWise website

Official marketing site (Vite + TypeScript, zh/en) plus a static **user manual** under `/docs/`.

Manual source of truth: [`../docs/user-manual/`](../docs/user-manual/) (Chinese).  
Build step `scripts/build-docs.mjs` renders Markdown into `dist/docs/` after Vite.

```bash
# from repo root
npm run website          # http://localhost:4173 (marketing only in vite dev)
npm run website:build

# Full Pages simulation (marketing + docs)
cd website
# PowerShell: $env:VITE_BASE='/datawise-cli/'
# bash: export VITE_BASE=/datawise-cli/
npm ci
npm run build:pages
npm run preview:pages
# open http://localhost:4173/datawise-cli/
# docs:  http://localhost:4173/datawise-cli/docs/

# regenerate dark + IDE screenshots into public/screenshots/ (+ docs/assets/marketing/)
npm run capture:website --prefix datawise-frontend
```

Live site (after Pages is enabled): `https://<owner>.github.io/datawise-cli/`  
Docs: `https://<owner>.github.io/datawise-cli/docs/`

Set `VITE_GITHUB_REPO=owner/datawise-cli` (Actions sets `github.repository`) so download / issue links match the new remote.
