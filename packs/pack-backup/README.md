# Sample Backup Pack

Scaffold for `pack.backup` with a `PackModuleContributor` health probe.

```bash
bash scripts/pack/build-pack-module.sh pack-backup
bash scripts/pack/sign-dpk.sh packs/pack-backup dist/packs/datawise-pack-backup-1.0.0-dev.dpk \
  --seal --site=dev --ed25519-private=dist/certs/pack-ci.priv.pem
# or sign all samples:
bash scripts/pack/sign-all-samples.sh
```

Manual SQL export remains free in Standard; this pack covers policy / schedule / restore APIs.
