#!/usr/bin/env bash
# Verify fat jar excludes for Standard optional modules (Wave 16–21).
# Default CI: without-ai + standard via spring-boot.excludes property.
# FULL_PACK_JAR_SCAN=1 also packages each without-* profile alone.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/datawise-backend"

# Prefer -Dspring-boot.excludes for composed Standard Core (reliable; avoids multi-profile
# Boot <excludes> merge quirks). Always drop *.jar and *.original so repackage cannot skip.
STANDARD_EXCLUDES="org.openjdk.jmh:jmh-core,org.openjdk.jmh:jmh-generator-annprocess,org.apache.datawise:datawise-ai,org.apache.datawise:datawise-lineage,org.apache.datawise:datawise-metadoc,org.apache.datawise:datawise-datagen,org.apache.datawise:datawise-sync,org.apache.datawise:datawise-backup"

scan_jar() {
  local profiles="$1"
  local pattern="$2"
  local label="$3"
  shift 3
  local extra_args=("$@")
  echo "== package datawise-server -P${profiles} ${extra_args[*]:-} =="
  # Drop previous thin/fat/original artifacts so spring-boot:repackage always runs.
  rm -f datawise-server/target/datawise-server-*.jar \
        datawise-server/target/datawise-server-*.jar.original
  # Source moves leave empty package dirs under target/classes; Boot still jars them
  # into BOOT-INF/classes/ and directory-only paths would fail the scan.
  rm -rf \
    datawise-server/target/classes/org/apache/datawise/backend/{ai,lineage,metadoc,datagen,sync,backup} \
    datawise-server/target/classes/org/apache/datawise/backend/controller/{backup,migration} \
    datawise-server/target/classes/org/apache/datawise/backend/server/backup \
    datawise-server/target/classes/org/apache/datawise/backend/database/backup
  mvn -q -pl datawise-server -am package -DskipTests -P"${profiles}" "${extra_args[@]}"
  local ja
  jar=$(ls -1t datawise-server/target/datawise-server-*.jar 2>/dev/null \
    | grep -vE '\.original$|sources\.jar$|javadoc\.jar$' \
    | head -n1 || true)
  if [[ -z "${jar:-}" ]]; then
    echo "FAIL: no datawise-server jar found after -P${profiles}"
    exit 1
  fi
  echo "== scan fat jar for $label: $jar =="
  # Ignore directory-only zip entries (trailing /); fail only on classes/nested jars.
  if jar tf "$jar" | grep -E "$pattern" | grep -vE '/$' >/dev/null; then
    echo "FAIL: fat jar still contains $label"
    jar tf "$jar" | grep -E "$pattern" | grep -vE '/$' | head -n 30
    exit 1
  fi
  echo "jar scan OK ($label) ($jar)"
}

scan_jar "without-ai,ops-extras" \
  'datawise-ai-|org/apache/datawise/backend/ai/' \
  'datawise-ai / AI classes'

scan_jar "standard,ops-extras" \
  'datawise-ai-|datawise-lineage-|datawise-metadoc-|datawise-datagen-|datawise-sync-|datawise-backup-|org/apache/datawise/backend/(ai|lineage|metadoc|datagen|sync|backup)/|org/apache/datawise/backend/server/backup/|org/apache/datawise/backend/database/backup/|org/apache/datawise/backend/controller/backup/' \
  'Standard paid optional modules' \
  "-Dspring-boot.excludes=${STANDARD_EXCLUDES}"

if [[ "${FULL_PACK_JAR_SCAN:-}" == "1" ]]; then
  scan_jar "without-lineage,ops-extras" \
    'datawise-lineage-|org/apache/datawise/backend/lineage/' \
    'datawise-lineage classes'
  scan_jar "without-metadoc,ops-extras" \
    'datawise-metadoc-|org/apache/datawise/backend/metadoc/' \
    'datawise-metadoc classes'
  scan_jar "without-datagen,ops-extras" \
    'datawise-datagen-|org/apache/datawise/backend/datagen/' \
    'datawise-datagen classes'
  scan_jar "without-sync,ops-extras" \
    'datawise-sync-|org/apache/datawise/backend/sync/' \
    'datawise-sync classes'
  scan_jar "without-backup,ops-extras" \
    'datawise-backup-|org/apache/datawise/backend/backup/|org/apache/datawise/backend/server/backup/|org/apache/datawise/backend/database/backup/|org/apache/datawise/backend/controller/backup/' \
    'datawise-backup classes'
fi
