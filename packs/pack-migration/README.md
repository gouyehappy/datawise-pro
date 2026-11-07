# Sample Migration Pack

Scaffold for `pack.migration` with a `PackModuleContributor` health probe.

```bash
bash scripts/pack/build-pack-module.sh pack-migration
bash scripts/pack/sign-dpk.sh packs/pack-migration dist/packs/datawise-pack-migration-1.0.0-dev.dpk \
  --seal --site=dev --ed25519-private=dist/certs/pack-ci.priv.pem
# or sign all samples:
bash scripts/pack/sign-all-samples.sh
```
