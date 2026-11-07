# Sample AI Offline Pack (`pack.ai.offline`)

Enterprise add-on SKU for air-gapped / local inference. Parallel to Hybrid `pack.ai`
(see PRODUCT_EXTENSION_PACKS.md). Suites do **not** auto-include this pack.

```bash
# from repo root
bash scripts/pack/build-pack-module.sh pack-ai-offline
bash scripts/pack/sign-dpk.sh packs/pack-ai-offline \
  dist/packs/datawise-pack-ai-offline-1.0.0-dev.dpk --seal --site=dev-site
```

`module-src/` builds into `backend/pack-ai-offline-module.jar` and registers
`PackModuleContributor` under `pack.ai.offline`.
