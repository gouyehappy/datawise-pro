#!/usr/bin/env bash
# Paid API dual-gate scan (Entitlement + RBAC) — PRODUCT_EXTENSION_PACKS Wave 17.
# Ensures known paid controllers contain both an entitlement gate and an auth/RBAC gate.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fail=0

check_file() {
  local rel="$1"
  local entitlement_pat="$2"
  local rbac_pat="$3"
  local path="$ROOT/$rel"
  if [[ ! -f "$path" ]]; then
    echo "FAIL: missing $rel"
    fail=1
    return
  fi
  if ! grep -Eq "$entitlement_pat" "$path"; then
    echo "FAIL: $rel missing entitlement gate ($entitlement_pat)"
    fail=1
  fi
  if ! grep -Eq "$rbac_pat" "$path"; then
    echo "FAIL: $rel missing RBAC/auth gate ($rbac_pat)"
    fail=1
  fi
}

echo "== paid API dual gates =="

# AI web (entitlement via AiAccessGate; session via SessionAuthFilter + explicit gates)
check_file \
  "datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/web/AiController.java" \
  'aiAccessGate\.(requireAiCallAccess|requireAiPack)' \
  'AiAccessGate|requireAiCall'

check_file \
  "datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/web/AnalysisCanvasController.java" \
  'requireAiPack' \
  'AiAccessGate'

check_file \
  "datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/web/SemanticLayerController.java" \
  'requireAiPack' \
  'AiAccessGate'

check_file \
  "datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/web/AiSchemaController.java" \
  'requireAiPack' \
  'AiAccessGate'

check_file \
  "datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/web/AiTableTagController.java" \
  'requireAiPack' \
  'AiAccessGate'

# Governance / Security — admin + pack
check_file \
  "datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/controller/platform/SchemaDriftController.java" \
  'requirePack\(PackIds\.GOVERNANCE\)' \
  'requireAdminUser'

check_file \
  "datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/controller/platform/DataQualityController.java" \
  'requirePack\(PackIds\.GOVERNANCE\)' \
  'requireAdminUser'

check_file \
  "datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/controller/platform/OutboundWebhookController.java" \
  'requirePack\(PackIds\.SECURITY\)' \
  'requireAdminUser'

check_file \
  "datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/controller/team/TeamController.java" \
  'requirePack\(PackIds\.SECURITY\)' \
  'teamService\.exportAuditLogs'

# Backup — admin + pack.backup (Wave 21: controller in datawise-backup)
check_file \
  "datawise-backend/datawise-backup/src/main/java/org/apache/datawise/backend/controller/backup/BackupController.java" \
  'requireBackupPack' \
  'requireAdminUser'

# Migration — trial cap gate + headless auth (Wave 20: controller in datawise-sync)
check_file \
  "datawise-backend/datawise-sync/src/main/java/org/apache/datawise/backend/sync/web/MigrationController.java" \
  'migrationAccessGate\.applyMigrationTrialCap|MigrationAccessGate' \
  'HeadlessMigrationAuth'

# Datagen / MetaDoc / DataOps — SQL access + pack
check_file \
  "datawise-backend/datawise-datagen/src/main/java/org/apache/datawise/backend/datagen/web/DatagenController.java" \
  'requirePack\(PackIds\.DATAGEN\)' \
  'HeadlessSqlAuth'

check_file \
  "datawise-backend/datawise-metadoc/src/main/java/org/apache/datawise/backend/metadoc/web/MetadataDocController.java" \
  'requireMetaDoc' \
  'HeadlessSqlAuth'

check_file \
  "datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/controller/sql/SqlController.java" \
  'requirePack\(PackIds\.DATAOPS\)' \
  'HeadlessSqlAuth'

# Lineage
check_file \
  "datawise-backend/datawise-lineage/src/main/java/org/apache/datawise/backend/lineage/api/LineageController.java" \
  'requirePack\(PackIds\.LINEAGE\)' \
  'requireLineagePack|PackEntitlementChecker'

# Federated AI generate
check_file \
  "datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/controller/platform/FederatedQueryController.java" \
  'requireAiPack' \
  'HeadlessSqlAuth'

if [[ "$fail" -ne 0 ]]; then
  echo "paid API dual-gate scan FAILED"
  exit 1
fi
echo "paid API dual-gate scan OK"
