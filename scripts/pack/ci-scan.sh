#!/usr/bin/env bash
# Pack / entitlement CI gates (PRODUCT_EXTENSION_PACKS §7.4 lite).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fail=0

echo "== entitlement.mode default must be open =="
if ! grep -qE 'mode:\s*open' "$ROOT/datawise-backend/datawise-server/src/main/resources/application.yml"; then
  echo "FAIL: datawise.entitlement.mode default is not open"
  fail=1
fi

echo "== allow-unsigned must default false =="
if ! grep -qE 'allow-unsigned:\s*false' "$ROOT/datawise-backend/datawise-server/src/main/resources/application.yml"; then
  echo "FAIL: allow-unsigned must be false in application.yml"
  fail=1
fi

echo "== PackIds frozen count =="
if ! grep -q 'CONNECTOR_BIGDATA' "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/domain/pack/PackIds.java"; then
  echo "FAIL: PackIds missing connector packs"
  fail=1
fi
if ! grep -q 'AI_OFFLINE' "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/domain/pack/PackIds.java"; then
  echo "FAIL: PackIds missing pack.ai.offline reservation (Wave 28)"
  fail=1
fi

echo "== error codes present =="
for code in PACK_INTEGRITY_FAILED CORE_VERSION_INCOMPATIBLE LICENSE_REQUIRED QUOTA_EXCEEDED CONNECTION_QUOTA_EXCEEDED; do
  if ! grep -q "$code" "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/common/DatawiseErrorCodes.java"; then
    echo "FAIL: missing error code $code"
    fail=1
  fi
done

echo "== server main must not import datawise-ai types =="
if grep -R --include='*.java' -n 'import org\.apache\.datawise\.backend\.ai\.' \
  "$ROOT/datawise-backend/datawise-server/src/main/java" >/dev/null 2>&1; then
  echo "FAIL: datawise-server still has compile-time imports of org.apache.datawise.backend.ai.*"
  grep -R --include='*.java' -n 'import org\.apache\.datawise\.backend\.ai\.' \
    "$ROOT/datawise-backend/datawise-server/src/main/java" || true
  fail=1
fi

echo "== without-ai profile present =="
if ! grep -q '<id>without-ai</id>' "$ROOT/datawise-backend/datawise-server/pom.xml"; then
  echo "FAIL: datawise-server pom missing without-ai profile"
  fail=1
fi

echo "== without-lineage profile present =="
if ! grep -q '<id>without-lineage</id>' "$ROOT/datawise-backend/datawise-server/pom.xml"; then
  echo "FAIL: datawise-server pom missing without-lineage profile"
  fail=1
fi

echo "== Wave 19–21 optional module profiles =="
for id in without-metadoc without-datagen without-sync without-backup standard; do
  if ! grep -q "<id>${id}</id>" "$ROOT/datawise-backend/datawise-server/pom.xml"; then
    echo "FAIL: datawise-server pom missing ${id} profile"
    fail=1
  fi
done
if [[ ! -f "$ROOT/datawise-backend/datawise-metadoc/src/main/java/org/apache/datawise/backend/metadoc/web/MetadataDocController.java" ]]; then
  echo "FAIL: MetadataDocController must live in datawise-metadoc (Wave 19)"
  fail=1
fi
if [[ ! -f "$ROOT/datawise-backend/datawise-datagen/src/main/java/org/apache/datawise/backend/datagen/web/DatagenController.java" ]]; then
  echo "FAIL: DatagenController must live in datawise-datagen (Wave 19)"
  fail=1
fi
if [[ ! -f "$ROOT/datawise-backend/datawise-sync/src/main/java/org/apache/datawise/backend/sync/web/MigrationController.java" ]]; then
  echo "FAIL: MigrationController must live in datawise-sync (Wave 20)"
  fail=1
fi
if [[ ! -f "$ROOT/datawise-backend/datawise-backup/src/main/java/org/apache/datawise/backend/controller/backup/BackupController.java" ]]; then
  echo "FAIL: BackupController must live in datawise-backup (Wave 21)"
  fail=1
fi
if grep -R --include='*.java' -l 'MetadataDocService\|DatagenService\|backend\.sync\.\|backend\.backup\.\|database\.backup' \
  "$ROOT/datawise-backend/datawise-server/src/main/java" 2>/dev/null | grep -q .; then
  echo "FAIL: datawise-server main must not import MetaDoc/Datagen/sync/backup implementation types"
  fail=1
fi
if ! grep -q 'MigrationAccessGate' \
  "$ROOT/datawise-backend/datawise-connectors/datawise-connector-spi/src/main/java/org/apache/datawise/backend/domain/pack/MigrationAccessGate.java"; then
  echo "FAIL: MigrationAccessGate SPI missing (Wave 20)"
  fail=1
fi
if ! grep -q 'BackupScheduleRunner' \
  "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/common/pack/BackupScheduleRunner.java"; then
  echo "FAIL: BackupScheduleRunner SPI missing (Wave 21)"
  fail=1
fi

echo "== Wave 22: desktop core connectors = free Standard set =="
PATHS_MJS="$ROOT/datawise-frontend/scripts/desktop/paths.mjs"
if ! grep -q "datawise-connector-mysql" "$PATHS_MJS" \
  || ! grep -q "datawise-connector-postgresql" "$PATHS_MJS" \
  || ! grep -q "datawise-connector-sqlite" "$PATHS_MJS"; then
  echo "FAIL: CORE_CONNECTOR_MODULES must include mysql/postgresql/sqlite"
  fail=1
fi
# Extract CORE_CONNECTOR_MODULES block and reject paid plugins (esp. H2).
CORE_BLOCK=$(awk '/export const CORE_CONNECTOR_MODULES = \[/,/\]/' "$PATHS_MJS")
if echo "$CORE_BLOCK" | grep -qE 'datawise-connector-(h2|oracle|dm|kafka|sqlserver)-|/datawise-connector-h2'; then
  echo "FAIL: desktop core profile must not preinstall paid connectors (Wave 22)"
  echo "$CORE_BLOCK"
  fail=1
fi
if grep -q "datawise-connector-h2-" "$PATHS_MJS" && grep -A6 'CORE_CONNECTOR_JAR_PREFIXES' "$PATHS_MJS" | grep -q 'h2'; then
  echo "FAIL: CORE_CONNECTOR_JAR_PREFIXES must not include h2 (Wave 22)"
  fail=1
fi
if ! grep -q 'FREE_CONNECTOR_IDS' \
  "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/domain/pack/PackConnectorMap.java"; then
  echo "FAIL: PackConnectorMap.FREE_CONNECTOR_IDS missing (Wave 22)"
  fail=1
fi

echo "== ViewModelLineageHooks SPI (Wave 18) =="
if ! grep -q 'ViewModelLineageHooks' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/controller/workspace/ViewModelController.java"; then
  echo "FAIL: ViewModelController must use ViewModelLineageHooks SPI"
  fail=1
fi
if [[ ! -f "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/common/support/SqlContentHash.java" ]]; then
  echo "FAIL: SqlContentHash must live in datawise-common"
  fail=1
fi
if [[ ! -f "$ROOT/datawise-backend/datawise-server/src/test/java/org/apache/datawise/backend/server/pack/EnforcedPaidApiSmokeTest.java" ]]; then
  echo "FAIL: EnforcedPaidApiSmokeTest missing (Wave 18)"
  fail=1
fi

echo "== datawise-ai marked optional =="
if ! grep -A2 'artifactId>datawise-ai' "$ROOT/datawise-backend/datawise-server/pom.xml" | grep -q '<optional>true</optional>'; then
  echo "FAIL: datawise-ai should be optional in datawise-server pom"
  fail=1
fi

echo "== Wave 26 Hybrid AI delivery =="
if [[ ! -f "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/config/AiDeliveryProperties.java" ]]; then
  echo "FAIL: AiDeliveryProperties missing"
  fail=1
fi
if ! grep -qE 'delivery:\s*offline' "$ROOT/datawise-backend/datawise-server/src/main/resources/application.yml"; then
  echo "FAIL: datawise.ai.delivery must default offline"
  fail=1
fi
if ! grep -q 'resolveBaseUrl' \
  "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/support/AiLlmGateway.java"; then
  echo "FAIL: AiLlmGateway must honour hybrid base URL"
  fail=1
fi

echo "== Wave 27 Hybrid opaque prompts =="
if [[ ! -f "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/support/AiHybridPromptProtocol.java" ]]; then
  echo "FAIL: AiHybridPromptProtocol missing"
  fail=1
fi
if ! grep -qE 'opaque-prompts:\s*true' "$ROOT/datawise-backend/datawise-server/src/main/resources/application.yml"; then
  echo "FAIL: datawise.ai.opaque-prompts must default true"
  fail=1
fi
if ! grep -q 'shouldUseOpaquePrompts' \
  "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/config/AiDeliveryProperties.java"; then
  echo "FAIL: AiDeliveryProperties.shouldUseOpaquePrompts missing"
  fail=1
fi
if ! grep -q 'resolveWireSystemPrompt' \
  "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/support/AiLlmGateway.java"; then
  echo "FAIL: AiLlmGateway must apply opaque wire system prompts"
  fail=1
fi

echo "== Wave 28 pack.ai.offline + gateway stub =="
if ! grep -q 'pack\.ai\.offline' \
  "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/domain/pack/PackIds.java"; then
  echo "FAIL: PackIds.AI_OFFLINE must be pack.ai.offline"
  fail=1
fi
if [[ ! -f "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/support/AiHybridPromptExpander.java" ]]; then
  echo "FAIL: AiHybridPromptExpander missing"
  fail=1
fi
if [[ ! -f "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/web/AiHybridGatewayStubController.java" ]]; then
  echo "FAIL: AiHybridGatewayStubController missing"
  fail=1
fi
if ! grep -qE 'gateway-stub:' "$ROOT/datawise-backend/datawise-server/src/main/resources/application.yml"; then
  echo "FAIL: application.yml missing gateway-stub config"
  fail=1
fi
if ! grep -q 'AI_OFFLINE\|pack.ai.offline' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/server/pack/AiAccessGuard.java"; then
  echo "FAIL: AiAccessGuard must honour pack.ai.offline"
  fail=1
fi

echo "== Wave 29 AI capability metering + offline pack scaffold =="
if [[ ! -f "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/domain/AiMeterCapabilities.java" ]]; then
  echo "FAIL: AiMeterCapabilities missing"
  fail=1
fi
if [[ ! -f "$ROOT/datawise-backend/datawise-config/src/main/resources/db/metadata/migration/V9__tenant_ai_usage_capability.sql" ]]; then
  echo "FAIL: V9 tenant AI capability migration missing"
  fail=1
fi
if ! grep -q 'requireAiCallQuota(String' \
  "$ROOT/datawise-backend/datawise-config/src/main/java/org/apache/datawise/backend/service/tenant/TenantQuotaService.java"; then
  echo "FAIL: TenantQuotaService must meter by capability"
  fail=1
fi
if ! grep -q 'AiMeterCapabilities.CHAT' \
  "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/web/AiController.java"; then
  echo "FAIL: AiController must pass capability meters"
  fail=1
fi
if [[ ! -f "$ROOT/packs/pack-ai-offline/manifest.json" ]]; then
  echo "FAIL: packs/pack-ai-offline scaffold missing"
  fail=1
fi
if ! grep -q 'pack.ai.offline' "$ROOT/packs/pack-ai-offline/manifest.json"; then
  echo "FAIL: pack-ai-offline manifest packId mismatch"
  fail=1
fi
if ! grep -q 'pack-ai-offline' "$ROOT/scripts/pack/sign-all-samples.sh"; then
  echo "FAIL: sign-all-samples must include pack-ai-offline"
  fail=1
fi

echo "== Wave 30 gateway upstream + usage UI hooks =="
if [[ ! -f "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/support/AiHybridGatewayRequestRewriter.java" ]]; then
  echo "FAIL: AiHybridGatewayRequestRewriter missing"
  fail=1
fi
if [[ ! -f "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/support/AiHybridGatewayUpstreamClient.java" ]]; then
  echo "FAIL: AiHybridGatewayUpstreamClient missing"
  fail=1
fi
if ! grep -q 'upstream-base-url' "$ROOT/datawise-backend/datawise-server/src/main/resources/application.yml"; then
  echo "FAIL: gateway-stub.upstream-base-url missing in application.yml"
  fail=1
fi
if ! grep -q 'pack-ai-offline-ci.dpk' "$ROOT/.github/workflows/pack-release.yml"; then
  echo "FAIL: pack-release must assert Offline AI .dpk artifact"
  fail=1
fi

echo "== Wave 31 AI QUOTA_EXCEEDED unification =="
if ! grep -q 'PackEntitlementException.quotaExceeded' \
  "$ROOT/datawise-backend/datawise-config/src/main/java/org/apache/datawise/backend/service/tenant/TenantQuotaService.java"; then
  echo "FAIL: TenantQuotaService must throw PackEntitlementException.quotaExceeded"
  fail=1
fi
if ! grep -q 'TENANT_AI_QUOTA_EXCEEDED' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/common/GlobalExceptionHandler.java"; then
  echo "FAIL: GlobalExceptionHandler must map legacy TENANT_AI_QUOTA_EXCEEDED"
  fail=1
fi

echo "== Wave 32 connection quota + platform AI stubs =="
if ! grep -q 'connectionQuotaExceeded' \
  "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/common/PackEntitlementException.java"; then
  echo "FAIL: PackEntitlementException.connectionQuotaExceeded missing"
  fail=1
fi
if ! grep -q 'connectionQuotaExceeded' \
  "$ROOT/datawise-backend/datawise-config/src/main/java/org/apache/datawise/backend/service/tenant/TenantQuotaService.java"; then
  echo "FAIL: TenantQuotaService must throw connectionQuotaExceeded"
  fail=1
fi
if ! grep -q 'TENANT_CONNECTION_QUOTA_EXCEEDED' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/common/GlobalExceptionHandler.java"; then
  echo "FAIL: GlobalExceptionHandler must map legacy TENANT_CONNECTION_QUOTA_EXCEEDED"
  fail=1
fi

echo "== Wave 33 semantic / federated AI metering =="
if ! grep -q 'SEMANTIC_AUTO' \
  "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/domain/AiMeterCapabilities.java"; then
  echo "FAIL: AiMeterCapabilities.SEMANTIC_AUTO missing"
  fail=1
fi
if ! grep -q 'FEDERATED_SQL' \
  "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/domain/AiMeterCapabilities.java"; then
  echo "FAIL: AiMeterCapabilities.FEDERATED_SQL missing"
  fail=1
fi
if ! grep -q 'AiMeterCapabilities.SEMANTIC_AUTO' \
  "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/web/SemanticLayerController.java"; then
  echo "FAIL: SemanticLayerController must meter SEMANTIC_AUTO"
  fail=1
fi
if ! grep -q 'AiMeterCapabilities.FEDERATED_SQL' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/controller/platform/FederatedQueryController.java"; then
  echo "FAIL: FederatedQueryController must meter FEDERATED_SQL"
  fail=1
fi

echo "== Wave 34 MCP AI gates + canvas metering =="
if ! grep -q 'CANVAS_RERUN' \
  "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/domain/AiMeterCapabilities.java"; then
  echo "FAIL: AiMeterCapabilities.CANVAS_RERUN missing"
  fail=1
fi
if ! grep -q 'AiMeterCapabilities.CANVAS_RERUN' \
  "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/web/AnalysisCanvasController.java"; then
  echo "FAIL: AnalysisCanvasController must meter CANVAS_RERUN"
  fail=1
fi
if ! grep -q 'aiAccessGate.requireAiPack' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/platform/mcp/McpBridgeService.java"; then
  echo "FAIL: McpBridgeService must requireAiPack for AI tools"
  fail=1
fi
if ! grep -q 'AiMeterCapabilities.FEDERATED_SQL' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/platform/mcp/McpBridgeService.java"; then
  echo "FAIL: McpBridgeService must meter federated SQL"
  fail=1
fi
if ! grep -q 'AiMeterCapabilities.CANVAS_RERUN' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/platform/mcp/McpBridgeService.java"; then
  echo "FAIL: McpBridgeService must meter canvas rerun"
  fail=1
fi

echo "== Wave 35 data-quality governance gate =="
if ! grep -q 'requirePack(PackIds.GOVERNANCE)' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/controller/platform/DataQualityController.java"; then
  echo "FAIL: DataQualityController must require pack.governance"
  fail=1
fi
if ! grep -q 'requireAdminUser' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/controller/platform/DataQualityController.java"; then
  echo "FAIL: DataQualityController must requireAdminUser"
  fail=1
fi

echo "== Wave 36 DataOps FE + store persona (hooks) =="
# Kill + lock-waits require DataOps; active-sessions free as of Wave 46 (FE in fe-scan).

echo "== Wave 37 grid export cap + governance diff preview (hooks) =="
# FE: FREE_GRID_EXPORT_MAX_ROWS + governance-diff-preview; scanned in fe-scan.

echo "== Wave 38 SQL history 200 + explain.pro + result-diff preview (hooks) =="
if ! grep -q 'FREE_MAX_ENTRIES = 200' \
  "$ROOT/datawise-backend/datawise-config/src/main/java/org/apache/datawise/backend/configstore/SqlHistoryLimits.java"; then
  echo "FAIL: SqlHistoryLimits.FREE_MAX_ENTRIES must be 200"
  fail=1
fi

echo "== Wave 39 Dev productivity Pro + AI sample (hooks) =="
# FE: guardDevProductivity + PackPaywallDialog sample; scanned in fe-scan.

echo "== Wave 40 site Pro trial + audit.pro (hooks) =="
if ! grep -q 'site-pro-trial-days:\s*7' \
  "$ROOT/datawise-backend/datawise-server/src/main/resources/application.yml"; then
  echo "FAIL: site-pro-trial-days must default to 7"
  fail=1
fi
if ! grep -q 'claimSiteProTrial' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/server/pack/EntitlementService.java"; then
  echo "FAIL: EntitlementService missing claimSiteProTrial"
  fail=1
fi
if ! grep -q 'requirePack(PackIds.SECURITY)' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/controller/team/TeamController.java"; then
  echo "FAIL: TeamController must require pack.security for full SQL audit export"
  fail=1
fi

echo "== Wave 41 governance full compare report (hooks) =="
# FE: governance-compare-report + Schema/CrossEnv export; scanned in fe-scan.

echo "== Wave 42 tenant Pro auto-trial (hooks) =="
if ! grep -q 'TENANT_PRO_TRIAL_STARTED' \
  "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/domain/pack/PackAuditActions.java"; then
  echo "FAIL: PackAuditActions.TENANT_PRO_TRIAL_STARTED missing"
  fail=1
fi
if ! grep -q 'tenantPackLicense' \
  "$ROOT/datawise-backend/datawise-config/src/main/java/org/apache/datawise/backend/configstore/ConfigPaths.java"; then
  echo "FAIL: ConfigPaths.tenantPackLicense missing"
  fail=1
fi
if ! grep -q 'autoClaimTenantProTrialIfEnabled' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/server/pack/EntitlementService.java"; then
  echo "FAIL: EntitlementService.autoClaimTenantProTrialIfEnabled missing"
  fail=1
fi

echo "== Wave 43 backup free manual vs schedule (hooks) =="
if ! grep -q 'isBackupEntitled' \
  "$ROOT/datawise-backend/datawise-connectors/datawise-connector-spi/src/main/java/org/apache/datawise/backend/domain/pack/MigrationAccessGate.java"; then
  echo "FAIL: MigrationAccessGate.isBackupEntitled missing"
  fail=1
fi
if ! grep -q 'sanitizeAdHocRun\|requireAdminOnly\|backupPackRequired' \
  "$ROOT/datawise-backend/datawise-backup/src/main/java/org/apache/datawise/backend/controller/backup/BackupController.java"; then
  echo "FAIL: BackupController must allow free ad-hoc runs (Wave 43)"
  fail=1
fi

echo "== Wave 44 cloud profile + migration trial banner (hooks) =="
CLOUD_YML="$ROOT/datawise-backend/datawise-server/src/main/resources/application-cloud.yml"
if [[ ! -f "$CLOUD_YML" ]]; then
  echo "FAIL: application-cloud.yml missing (Wave 44)"
  fail=1
elif ! grep -q 'auto-claim-tenant-pro-trial:\s*true' "$CLOUD_YML"; then
  echo "FAIL: application-cloud.yml must enable auto-claim-tenant-pro-trial (Wave 44)"
  fail=1
elif ! grep -q 'mode:\s*enforced' "$CLOUD_YML"; then
  echo "FAIL: application-cloud.yml must set entitlement.mode enforced (Wave 44)"
  fail=1
fi
if ! grep -q 'showMigrationTrialBanner\|FREE_MIGRATION_ROWS_LIMIT\|migration-trial-banner' \
  "$ROOT/datawise-frontend/src/features/workspace/components/migration/MigrationPreflightStep.vue"; then
  echo "FAIL: MigrationPreflightStep trial banner missing (Wave 44)"
  fail=1
fi

echo "== Wave 45 PDF print + trial ending + security retest (hooks) =="
if ! grep -q 'openHtmlPrintDialog' \
  "$ROOT/datawise-frontend/src/features/pack/services/governance-compare-report.ts"; then
  echo "FAIL: governance report must open print dialog for PDF (Wave 45)"
  fail=1
fi
if ! grep -q 'listEndingTrials\|TrialEndingBanner' \
  "$ROOT/datawise-frontend/src/features/pack/components/TrialEndingBanner.vue"; then
  echo "FAIL: TrialEndingBanner missing (Wave 45)"
  fail=1
fi
if ! grep -q 'TrialEndingBanner' "$ROOT/datawise-frontend/src/app/AppShell.vue"; then
  echo "FAIL: AppShell must mount TrialEndingBanner (Wave 45)"
  fail=1
fi

echo "== Wave 46 free active-sessions + pack audit UI (hooks) =="
if grep -A8 '@GetMapping("/active-sessions")' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/controller/sql/SqlController.java" \
  | grep -q 'requirePack(PackIds.DATAOPS)'; then
  echo "FAIL: active-sessions must not require DataOps (Wave 46)"
  fail=1
fi
if ! grep -A8 '@GetMapping("/lock-waits")' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/controller/sql/SqlController.java" \
  | grep -q 'requirePack(PackIds.DATAOPS)'; then
  echo "FAIL: lock-waits must still require DataOps (Wave 46)"
  fail=1
fi
if ! grep -q 'PackAuditPanel' \
  "$ROOT/datawise-frontend/src/features/pack/components/PackStorePanel.vue"; then
  echo "FAIL: PackStorePanel must show PackAuditPanel for admins (Wave 46)"
  fail=1
fi

echo "== Wave 47 heartbeat snapshot + status chip (hooks) =="
if ! grep -q 'heartbeatConfigured\|heartbeatAt' \
  "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/domain/pack/EntitlementSnapshotDto.java"; then
  echo "FAIL: EntitlementSnapshotDto heartbeat fields missing (Wave 47)"
  fail=1
fi
if ! grep -q 'status-bar__entitlement\|showEntitlementChip' \
  "$ROOT/datawise-frontend/src/features/layout/components/StatusBar.vue"; then
  echo "FAIL: StatusBar entitlement chip missing (Wave 47)"
  fail=1
fi
echo "== Wave 48 security-retest script (hooks) =="
if [[ ! -f "$ROOT/scripts/pack/security-retest.sh" ]]; then
  echo "FAIL: scripts/pack/security-retest.sh missing (Wave 48)"
  fail=1
elif ! grep -q 'api-gate-scan\|fe-scan\|ci-scan' "$ROOT/scripts/pack/security-retest.sh"; then
  echo "FAIL: security-retest.sh must orchestrate pack scans (Wave 48)"
  fail=1
fi
if ! grep -q 'security-retest.sh' "$ROOT/.github/workflows/backend-tests.yml"; then
  echo "FAIL: backend-tests must run security-retest.sh (Wave 48)"
  fail=1
fi

echo "== connector download https policy documented =="
if ! grep -q 'require-https:\s*true' "$ROOT/datawise-backend/datawise-server/src/main/resources/application.yml"; then
  echo "FAIL: datawise.connector.download.require-https must default true"
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo "pack CI scan FAILED"
  exit 1
fi
echo "pack CI scan OK"
