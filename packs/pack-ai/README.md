# Sample AI Pack source tree

Used by `PackDpkCli` / `scripts/pack/sign-dpk.sh` to produce a signed `.dpk`.

```bash
# from repo root — compile sample PackModuleContributor JAR first
bash scripts/pack/build-pack-module.sh pack-ai
bash scripts/pack/sign-dpk.sh packs/pack-ai dist/packs/datawise-pack-ai-1.0.0-dev.dpk
# sealed modules (backend/frontend/native):
bash scripts/pack/sign-dpk.sh packs/pack-ai dist/packs/datawise-pack-ai-1.0.0-dev.dpk --seal --site=dev-site
# all sample packs (ai + migration + backup):
bash scripts/pack/sign-all-samples.sh
```

`module-src/` builds into `backend/pack-ai-module.jar` and registers
`META-INF/services/...PackModuleContributor` for host ClassLoader hot-bind.
