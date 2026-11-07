#!/usr/bin/env bash
# Sign a pack directory into a .dpk (PRODUCT_EXTENSION_PACKS Wave 8).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PACK_DIR="${1:-}"
OUT="${2:-}"
shift 2 || true

if [[ -z "$PACK_DIR" || -z "$OUT" ]]; then
  echo "Usage: sign-dpk.sh <packDir> <out.dpk> [--seal] [--site=id] [--secret=...] [--ed25519-private=pem] [--allow-dev-secret]"
  exit 2
fi

cd "$ROOT/datawise-backend"
mvn -q -pl datawise-common -am package -DskipTests
# Resolve jackson + friends from local reactor (Maven uses ; on Windows, : elsewhere)
mvn -q -pl datawise-common dependency:build-classpath -Dmdep.outputFile=target/cp.txt
DEP_CP="$(cat datawise-common/target/cp.txt)"
if [[ "$DEP_CP" == *";"* ]]; then
  CP="datawise-common/target/classes;$DEP_CP"
else
  CP="datawise-common/target/classes:$DEP_CP"
fi

mkdir -p "$(dirname "$OUT")"
# Windows java.exe needs native paths when invoked from Git Bash
pack_abs="$ROOT/$PACK_DIR"
out_abs="$ROOT/$OUT"
# Rewrite relative --ed25519-private= paths against repo root (cwd is datawise-backend)
args=()
for a in "$@"; do
  if [[ "$a" == --ed25519-private=* ]]; then
    pem="${a#--ed25519-private=}"
    if [[ "$pem" != /* && "$pem" != [A-Za-z]:* ]]; then
      pem="$ROOT/$pem"
    fi
    if command -v cygpath >/dev/null 2>&1; then
      pem="$(cygpath -w "$pem")"
    fi
    args+=("--ed25519-private=$pem")
  else
    args+=("$a")
  fi
done
if command -v cygpath >/dev/null 2>&1; then
  pack_abs="$(cygpath -w "$pack_abs")"
  out_abs="$(cygpath -w "$out_abs")"
fi
# Local/CI sample signing may rely on the public HMAC default; require an explicit opt-in
# unless a non-default secret is provided via --secret or DATAWISE_PACK_SIGNING_SECRET.
has_secret_flag=false
has_allow_dev=false
for a in "${args[@]+"${args[@]}"}"; do
  if [[ "$a" == --secret=* ]]; then has_secret_flag=true; fi
  if [[ "$a" == --allow-dev-secret ]]; then has_allow_dev=true; fi
done
if [[ "$has_secret_flag" == false && -z "${DATAWISE_PACK_SIGNING_SECRET:-}" && "$has_allow_dev" == false ]]; then
  args+=(--allow-dev-secret)
fi
java -cp "$CP" org.apache.datawise.backend.domain.pack.PackDpkCli build \
  "$pack_abs" "$out_abs" "${args[@]}"
echo "OK $OUT"
