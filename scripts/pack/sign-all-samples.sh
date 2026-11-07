#!/usr/bin/env bash
# Build sample module JARs and sign all sample packs under packs/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PACKS=(
  pack-ai
  pack-ai-offline
  pack-migration
  pack-backup
  pack-governance
  pack-lineage
  pack-dataops
  pack-datagen
  pack-security
  pack-connector-enterprise
  pack-connector-domestic
  pack-connector-bigdata
)

CERT_DIR="${CERT_DIR:-dist/certs}"
OUT_DIR="${OUT_DIR:-dist/packs}"
SITE="${SITE:-ci}"
PRIV="${ED25519_PRIVATE:-$CERT_DIR/pack-ci.priv.pem}"
PUB="${ED25519_PUBLIC:-$CERT_DIR/pack-ci.pub.pem}"

mkdir -p "$CERT_DIR" "$OUT_DIR"

cd "$ROOT/datawise-backend"
mvn -q -pl datawise-common -am package -DskipTests
mvn -q -pl datawise-common dependency:build-classpath -Dmdep.outputFile=target/cp.txt
DEP_CP="$(cat datawise-common/target/cp.txt)"
if [[ "$DEP_CP" == *";"* ]]; then
  CP="datawise-common/target/classes;$DEP_CP"
else
  CP="datawise-common/target/classes:$DEP_CP"
fi

if [[ ! -f "$ROOT/$PRIV" ]]; then
  priv_abs="$ROOT/$PRIV"
  pub_abs="$ROOT/$PUB"
  if command -v cygpath >/dev/null 2>&1; then
    priv_abs="$(cygpath -w "$priv_abs")"
    pub_abs="$(cygpath -w "$pub_abs")"
  fi
  java -cp "$CP" org.apache.datawise.backend.domain.pack.PackDpkCli keygen \
    "$priv_abs" "$pub_abs"
fi

cd "$ROOT"
for pack in "${PACKS[@]}"; do
  if [[ -d "packs/$pack/module-src" ]]; then
    bash scripts/pack/build-pack-module.sh "$pack"
  fi
  out="$OUT_DIR/datawise-${pack}-ci.dpk"
  bash scripts/pack/sign-dpk.sh "packs/$pack" "$out" \
    --seal --site="$SITE" \
    --ed25519-private="$PRIV"
done

echo "Signed packs in $OUT_DIR:"
ls -la "$OUT_DIR"/*.dpk
