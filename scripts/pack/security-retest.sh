#!/usr/bin/env bash
# Pack security retest — automated checks for pack governance invariants
#
# Usage:
#   bash scripts/pack/security-retest.sh
#   RUN_MVN=1 bash scripts/pack/security-retest.sh   # also run targeted Maven tests
#
# Exit 0 only when all enabled phases pass.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

RUN_MVN="${RUN_MVN:-0}"
fail=0
stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%S)"

echo "============================================================"
echo " Pack security retest  @ ${stamp}"
echo " RUN_MVN=${RUN_MVN}"
echo "============================================================"

echo ""
echo "== phase: static scans =="
if ! bash "$ROOT/scripts/pack/ci-scan.sh"; then
  echo "FAIL: ci-scan"
  fail=1
fi
if ! bash "$ROOT/scripts/pack/fe-scan.sh"; then
  echo "FAIL: fe-scan"
  fail=1
fi
if ! bash "$ROOT/scripts/pack/api-gate-scan.sh"; then
  echo "FAIL: api-gate-scan"
  fail=1
fi
if [[ "${RUN_JAR_SCAN:-0}" == "1" ]]; then
  if ! bash "$ROOT/scripts/pack/without-ai-jar-scan.sh"; then
    echo "FAIL: without-ai-jar-scan"
    fail=1
  fi
else
  echo "SKIP: without-ai-jar-scan (set RUN_JAR_SCAN=1 to enable; CI runs it separately)"
fi

echo ""
echo "== phase: required test sources present =="
required_tests=(
  "datawise-backend/datawise-server/src/test/java/org/apache/datawise/backend/server/pack/EnforcedPaidApiSmokeTest.java"
  "datawise-backend/datawise-server/src/test/java/org/apache/datawise/backend/server/pack/LicenseCodecTest.java"
  "datawise-backend/datawise-common/src/test/java/org/apache/datawise/backend/domain/pack/PackDpkCodecTest.java"
  "datawise-backend/datawise-common/src/test/java/org/apache/datawise/backend/domain/pack/PackSuiteMapTest.java"
)
for rel in "${required_tests[@]}"; do
  if [[ ! -f "$ROOT/$rel" ]]; then
    echo "FAIL: missing $rel"
    fail=1
  else
    echo "OK: $rel"
  fi
done

compat="$ROOT/datawise-backend/datawise-common/src/test/java/org/apache/datawise/backend/domain/pack/PackCompatMatrixTest.java"
if [[ -f "$compat" ]]; then
  echo "OK: PackCompatMatrixTest.java"
else
  echo "WARN: PackCompatMatrixTest.java not found (optional)"
fi

if [[ "$RUN_MVN" == "1" ]]; then
  echo ""
  echo "== phase: Maven pack security tests =="
  if ! command -v mvn >/dev/null 2>&1; then
    echo "FAIL: mvn not on PATH"
    fail=1
  else
    # shellcheck disable=SC2086
    if ! (
      cd "$ROOT/datawise-backend"
      mvn -B -q \
        -pl datawise-common,datawise-server \
        -am \
        test \
        -Dtest=EnforcedPaidApiSmokeTest,LicenseCodecTest,PackDpkCodecTest,PackSuiteMapTest,PackCompatMatrixTest,PackEd25519Test \
        -DfailIfNoTests=false \
        -Dsurefire.failIfNoSpecifiedTests=false
    ); then
      echo "FAIL: Maven pack security tests"
      fail=1
    else
      echo "OK: Maven pack security tests"
    fi
  fi
else
  echo ""
  echo "== phase: Maven pack security tests = SKIPPED (set RUN_MVN=1 to enable) =="
fi

echo ""
echo "============================================================"
if [[ "$fail" -ne 0 ]]; then
  echo " Pack security retest FAILED"
  echo "============================================================"
  exit 1
fi
echo " Pack security retest OK"
echo " Manual smoke items remain in the pack security retest checklist (internal)"
echo "============================================================"
exit 0
