#!/usr/bin/env bash
# Frontend / source paid-feature scan (PRODUCT_EXTENSION_PACKS §7.4).
# Fails if Standard-forbidden markers appear in a Standard dist (when DIST_DIR set),
# or documents allowlisted host imports in source.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FE="$ROOT/datawise-frontend"
fail=0

# Markers that must NOT appear in a stripped Standard edition dist.
MARKERS=(
  'AiWorkbenchView'
  'pack.ai.offline'
  'module.sealed'
  'backup-stat-grid'
  'schema-compare__head'
)

echo "== source: pack entitlement host remains present =="
if ! grep -R --include='*.ts' --include='*.vue' -l "useEntitlementStore" "$FE/src" >/dev/null; then
  echo "FAIL: entitlement store not referenced in frontend"
  fail=1
fi

echo "== source: PLUGIN_PACK_MAP covers governance plugins =="
if ! grep -q "p-schema-compare" "$FE/src/features/pack/catalog/pack-catalog.ts"; then
  echo "FAIL: PLUGIN_PACK_MAP missing p-schema-compare"
  fail=1
fi

echo "== source: standard edition hook present =="
if ! grep -q "VITE_DATAWISE_EDITION" "$FE/vite.config.ts"; then
  echo "FAIL: vite.config missing VITE_DATAWISE_EDITION"
  fail=1
fi
if ! grep -q "build:standard" "$FE/package.json"; then
  echo "FAIL: package.json missing build:standard"
  fail=1
fi
if ! grep -q "hideAiSections" "$FE/src/features/settings/constants/settings-nav.config.ts"; then
  echo "FAIL: settings nav missing hideAiSections (Wave 13)"
  fail=1
fi
if [[ ! -f "$ROOT/scripts/pack/sign-all-samples.sh" ]]; then
  echo "FAIL: missing scripts/pack/sign-all-samples.sh (Wave 14)"
  fail=1
fi
if [[ ! -d "$ROOT/packs/pack-migration/module-src" || ! -d "$ROOT/packs/pack-backup/module-src" ]]; then
  echo "FAIL: pack-migration/backup module-src missing (Wave 14)"
  fail=1
fi
for p in pack-governance pack-lineage pack-dataops pack-datagen pack-security; do
  if [[ ! -d "$ROOT/packs/$p/module-src" ]]; then
    echo "FAIL: missing packs/$p/module-src (Wave 15)"
    fail=1
  fi
done
for p in pack-connector-enterprise pack-connector-domestic pack-connector-bigdata; do
  if [[ ! -d "$ROOT/packs/$p/module-src" ]]; then
    echo "FAIL: missing packs/$p/module-src (Wave 16)"
    fail=1
  fi
done
if [[ ! -f "$ROOT/scripts/pack/without-ai-jar-scan.sh" ]]; then
  echo "FAIL: missing scripts/pack/without-ai-jar-scan.sh (Wave 16)"
  fail=1
fi
if ! grep -q "sourcemap: false" "$FE/vite.config.ts"; then
  echo "FAIL: vite.config missing sourcemap: false (Wave 17)"
  fail=1
fi
if [[ ! -f "$ROOT/scripts/pack/api-gate-scan.sh" ]]; then
  echo "FAIL: missing scripts/pack/api-gate-scan.sh (Wave 17)"
  fail=1
fi
if ! grep -q "sales:" "$FE/src/i18n/locales/zh-CN/pack.ts" \
  || ! grep -q "headline:" "$FE/src/i18n/locales/zh-CN/pack.ts"; then
  echo "FAIL: zh-CN pack.ts missing pack.sales keys (Wave 18)"
  fail=1
fi
if ! grep -q "sales:" "$FE/src/i18n/locales/en-US/pack.ts"; then
  echo "FAIL: en-US pack.ts missing pack.sales keys (Wave 18)"
  fail=1
fi
if [[ ! -f "$FE/src/__tests__/regression/pack-sales-i18n.test.ts" ]]; then
  echo "FAIL: missing pack-sales-i18n.test.ts (Wave 18)"
  fail=1
fi
if ! grep -q "without-lineage" "$ROOT/scripts/pack/without-ai-jar-scan.sh"; then
  echo "FAIL: without-ai-jar-scan.sh must reference without-lineage (Wave 18)"
  fail=1
fi
if ! grep -q 'STANDARD_EXCLUDES=' "$ROOT/scripts/pack/without-ai-jar-scan.sh" \
  && ! grep -q 'spring-boot.excludes' "$ROOT/scripts/pack/without-ai-jar-scan.sh"; then
  echo "FAIL: without-ai-jar-scan.sh must use spring-boot.excludes for Standard (Wave 20)"
  fail=1
fi
if ! grep -q "without-backup\|datawise-backup" "$ROOT/scripts/pack/without-ai-jar-scan.sh"; then
  echo "FAIL: without-ai-jar-scan.sh must cover datawise-backup (Wave 21)"
  fail=1
fi
if ! grep -q 'FREE_CONNECTOR_IDS' \
  "$ROOT/datawise-backend/datawise-common/src/main/java/org/apache/datawise/backend/domain/pack/PackConnectorMap.java"; then
  echo "FAIL: PackConnectorMap.FREE_CONNECTOR_IDS missing (Wave 22)"
  fail=1
fi
CORE_IDS="$FE/src/features/settings/services/runtime-format.service.ts"
if ! grep -q "CORE_CONNECTOR_IDS" "$CORE_IDS"; then
  echo "FAIL: CORE_CONNECTOR_IDS missing (Wave 22)"
  fail=1
elif grep -A3 'CORE_CONNECTOR_IDS' "$CORE_IDS" | grep -qE "'h2'|\"h2\""; then
  echo "FAIL: CORE_CONNECTOR_IDS must not include h2 (Wave 22)"
  fail=1
fi
PATHS_MJS="$FE/scripts/desktop/paths.mjs"
if grep -A8 'export const CORE_CONNECTOR_MODULES' "$PATHS_MJS" | grep -q 'connector-h2'; then
  echo "FAIL: desktop CORE_CONNECTOR_MODULES must not include h2 (Wave 22)"
  fail=1
fi
if [[ ! -f "$FE/src/features/pack/stubs/MigrationWorkbenchStub.vue" ]] \
  || [[ ! -f "$FE/src/features/pack/stubs/BackupSettingsStub.vue" ]]; then
  echo "FAIL: migration/backup standard stubs missing (Wave 23)"
  fail=1
fi
if ! grep -q 'MigrationWorkbenchStub' "$FE/src/features/workspace/governance.feature.ts"; then
  echo "FAIL: governance.feature must stub table-migration in standard edition (Wave 23)"
  fail=1
fi
if ! grep -q 'BackupSettingsStub' "$FE/src/features/settings/settings-section-registry.ts"; then
  echo "FAIL: settings-section-registry must stub backupCenter in standard edition (Wave 23)"
  fail=1
fi
if ! grep -q 'hideBackupSection\|backupCenter' "$FE/src/features/settings/constants/settings-nav.config.ts"; then
  echo "FAIL: settings nav missing backup hide for standard (Wave 23)"
  fail=1
fi
for stub in GovernanceSchemaStub GovernanceCrossEnvStub MetadocWorkbenchStub LineageWorkbenchStub MigrationWizardStepsStub; do
  if [[ ! -f "$FE/src/features/pack/stubs/${stub}.vue" ]]; then
    echo "FAIL: missing ${stub}.vue (Wave 24)"
    fail=1
  fi
done
if ! grep -q 'GovernanceSchemaStub' "$FE/src/features/workspace/governance.feature.ts" \
  || ! grep -q 'LineageWorkbenchStub' "$FE/src/features/workspace/governance.feature.ts" \
  || ! grep -q 'MetadocWorkbenchStub' "$FE/src/features/workspace/governance.feature.ts"; then
  echo "FAIL: governance.feature must stub governance/lineage/metadoc in standard edition (Wave 24)"
  fail=1
fi
if ! grep -q 'SchemaCompareTab' "$FE/vite/standard-edition-plugin.ts" \
  || ! grep -q 'ViewModelLineageTab' "$FE/vite/standard-edition-plugin.ts"; then
  echo "FAIL: standard-edition-plugin must redirect governance/lineage tabs (Wave 24)"
  fail=1
fi
for stub in DataopsMonitorStub DatagenFakeDataStub SecurityWebhookStub; do
  if [[ ! -f "$FE/src/features/pack/stubs/${stub}.vue" ]]; then
    echo "FAIL: missing ${stub}.vue (Wave 25)"
    fail=1
  fi
done
if ! grep -q 'DataopsMonitorStub' "$FE/src/features/layout/components/ShortcutPanelDrawer.vue"; then
  echo "FAIL: ShortcutPanelDrawer must stub SqlMonitor in standard edition (Wave 25)"
  fail=1
fi
if ! grep -q 'SqlMonitorPanel' "$FE/vite/standard-edition-plugin.ts" \
  || ! grep -q 'FakeDataDialog.vue' "$FE/vite/standard-edition-plugin.ts"; then
  echo "FAIL: standard-edition-plugin must redirect dataops/datagen UI (Wave 25)"
  fail=1
fi
if ! grep -q "pack.security" "$FE/src/features/settings/components/IntegrationsSettingsPanel.vue"; then
  echo "FAIL: IntegrationsSettingsPanel must gate webhooks with pack.security (Wave 25)"
  fail=1
fi
if ! grep -q 'ViewModelLineagePreviewPanel' "$FE/vite/standard-edition-plugin.ts"; then
  echo "FAIL: standard-edition-plugin must redirect ViewModelLineagePreviewPanel (Wave 26)"
  fail=1
fi
if ! grep -q 'openPaywall.*pack.lineage\|pack.lineage.*tab.lineage' \
  "$FE/src/features/workspace/components/tabs/ViewModelEditorTab.vue"; then
  echo "FAIL: ViewModelEditorTab must paywall lineage preview in standard (Wave 26)"
  fail=1
fi
if ! grep -qE 'delivery:\s*offline' \
  "$ROOT/datawise-backend/datawise-server/src/main/resources/application.yml"; then
  echo "FAIL: application.yml missing datawise.ai.delivery default offline (Wave 26)"
  fail=1
fi
if [[ ! -f "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/config/AiDeliveryProperties.java" ]]; then
  echo "FAIL: AiDeliveryProperties missing (Wave 26 Hybrid)"
  fail=1
fi
if [[ ! -f "$ROOT/datawise-backend/datawise-ai/src/main/java/org/apache/datawise/backend/ai/support/AiHybridPromptProtocol.java" ]]; then
  echo "FAIL: AiHybridPromptProtocol missing (Wave 27)"
  fail=1
fi
if ! grep -qE 'opaque-prompts:\s*true' \
  "$ROOT/datawise-backend/datawise-server/src/main/resources/application.yml"; then
  echo "FAIL: application.yml missing opaque-prompts default true (Wave 27)"
  fail=1
fi
if ! grep -q "pack.ai.offline" "$FE/src/features/pack/types/pack.types.ts"; then
  echo "FAIL: FE PACK_IDS missing pack.ai.offline (Wave 28)"
  fail=1
fi
if ! grep -q "pack.ai.offline" "$FE/src/features/pack/catalog/pack-catalog.ts"; then
  echo "FAIL: FE PACK_CATALOG missing pack.ai.offline (Wave 28)"
  fail=1
fi
if ! grep -q 'isAiUsable' "$FE/src/features/pack/stores/entitlement-store.ts"; then
  echo "FAIL: entitlement-store must expose isAiUsable (Wave 28)"
  fail=1
fi
if ! grep -q 'byCapability' "$FE/src/shared/api/types.ts"; then
  echo "FAIL: TenantAiUsage missing byCapability (Wave 29)"
  fail=1
fi
if [[ ! -f "$FE/src/features/settings/services/tenant-ai-usage-breakdown.ts" ]]; then
  echo "FAIL: tenant-ai-usage-breakdown missing (Wave 30)"
  fail=1
fi
if ! grep -q 'aiCapabilityRows\|buildAiCapabilityUsageRows' \
  "$FE/src/features/settings/components/TenantsSettingsPanel.vue"; then
  echo "FAIL: TenantsSettingsPanel must show capability breakdown (Wave 30)"
  fail=1
fi
if ! grep -q 'aiUsageByCapability' "$FE/src/i18n/locales/zh-CN/settings.ts"; then
  echo "FAIL: zh-CN settings missing aiUsageByCapability (Wave 30)"
  fail=1
fi
if [[ ! -f "$FE/src/features/ai/shared/components/AiQuotaUsageMeter.vue" ]]; then
  echo "FAIL: AiQuotaUsageMeter missing (Wave 31)"
  fail=1
fi
if ! grep -q 'AiQuotaUsageMeter' "$FE/src/features/ai/chat/components/AiChatMain.vue"; then
  echo "FAIL: AiChatMain must mount AiQuotaUsageMeter (Wave 31)"
  fail=1
fi
if ! grep -q 'TENANT_AI_QUOTA_EXCEEDED' "$FE/src/features/pack/stores/entitlement-store.ts"; then
  echo "FAIL: entitlement-store must treat TENANT_AI_QUOTA_EXCEEDED (Wave 31)"
  fail=1
fi
if ! grep -q 'meterLabel' "$FE/src/i18n/locales/zh-CN/ai.ts"; then
  echo "FAIL: zh-CN ai.quota meter keys missing (Wave 31)"
  fail=1
fi
if ! grep -q 'FederatedViewWizardDialog' "$FE/vite/standard-edition-plugin.ts"; then
  echo "FAIL: standard-edition-plugin must stub FederatedViewWizardDialog (Wave 32)"
  fail=1
fi
if ! grep -q 'AnalysisCanvasRerunDialog' "$FE/vite/standard-edition-plugin.ts"; then
  echo "FAIL: standard-edition-plugin must stub AnalysisCanvasRerunDialog (Wave 32)"
  fail=1
fi
if [[ ! -f "$FE/src/features/pack/stubs/PlatformAiDialogStub.vue" ]]; then
  echo "FAIL: PlatformAiDialogStub missing (Wave 32)"
  fail=1
fi
if ! grep -q 'CONNECTION_QUOTA_EXCEEDED' "$FE/src/shared/api/http/api-error-codes.ts"; then
  echo "FAIL: FE api-error-codes missing CONNECTION_QUOTA_EXCEEDED (Wave 32)"
  fail=1
fi
if ! grep -q 'ai.semantic.auto' "$FE/src/features/ai/shared/services/tenant-ai-usage-breakdown.ts"; then
  echo "FAIL: tenant-ai-usage-breakdown missing ai.semantic.auto (Wave 33)"
  fail=1
fi
if ! grep -q 'guardAiNav' "$FE/src/features/workspace/components/tabs/PlatformCatalogTab.vue"; then
  echo "FAIL: PlatformCatalogTab must guardAiNav for AI actions (Wave 33)"
  fail=1
fi
if ! grep -q "VITE_DATAWISE_EDITION === 'standard'" \
  "$FE/src/features/auth/services/feature-permission.service.ts"; then
  echo "FAIL: canAccessExplorerCatalogAi must hide standard edition (Wave 33)"
  fail=1
fi
if ! grep -q 'capSemanticAuto' "$FE/src/i18n/locales/zh-CN/ai.ts"; then
  echo "FAIL: zh-CN ai.quota.capSemanticAuto missing (Wave 33)"
  fail=1
fi
if ! grep -q 'isPlatformAiFeature' "$FE/src/features/platform/services/platform-ai-feature.ts"; then
  echo "FAIL: platform-ai-feature helper missing (Wave 34)"
  fail=1
fi
if ! grep -q 'isPlatformAiFeature' "$FE/src/features/workspace/stores/workspace-open-apps.domain.ts"; then
  echo "FAIL: openPlatformCatalog must gate AI features (Wave 34)"
  fail=1
fi
if ! grep -q 'ai.canvas.rerun' "$FE/src/features/ai/shared/services/tenant-ai-usage-breakdown.ts"; then
  echo "FAIL: tenant-ai-usage-breakdown missing ai.canvas.rerun (Wave 34)"
  fail=1
fi
if ! grep -q 'capCanvasRerun' "$FE/src/i18n/locales/zh-CN/ai.ts"; then
  echo "FAIL: zh-CN ai.quota.capCanvasRerun missing (Wave 34)"
  fail=1
fi
if ! grep -q 'isPlatformGovernanceFeature' "$FE/src/features/platform/services/platform-ai-feature.ts"; then
  echo "FAIL: isPlatformGovernanceFeature missing (Wave 35)"
  fail=1
fi
if ! grep -q 'isPlatformGovernanceFeature' "$FE/src/features/workspace/stores/workspace-open-apps.domain.ts"; then
  echo "FAIL: openPlatformCatalog must gate governance features (Wave 35)"
  fail=1
fi
if ! grep -q 'noteAiSqlGenerateSuccess' "$FE/src/features/pack/stores/entitlement-store.ts"; then
  echo "FAIL: entitlement-store missing noteAiSqlGenerateSuccess (Wave 35)"
  fail=1
fi
if ! grep -q 'noteAiSqlGenerateSuccess' "$FE/src/features/workspace/composables/useAiPromptPanel.ts"; then
  echo "FAIL: useAiPromptPanel must fire SQL success conversion (Wave 35)"
  fail=1
fi
if ! grep -q 'aiSqlSuccessToast' "$FE/src/i18n/locales/zh-CN/pack.ts"; then
  echo "FAIL: zh-CN pack.paywall.aiSqlSuccessToast missing (Wave 35)"
  fail=1
fi
if ! grep -q "guardPack('pack.dataops'" "$FE/src/features/workspace/composables/useSessionKill.ts"; then
  echo "FAIL: useSessionKill must guardPack dataops (Wave 36)"
  fail=1
fi
# Wave 46: active sessions list is free; Kill / lock analysis stay gated.
if grep -q "guardPack('pack.dataops', 'panel.dataops')" \
  "$FE/src/features/workspace/components/ActiveSessionsPanel.vue"; then
  echo "FAIL: ActiveSessionsPanel must not hard-gate list load (Wave 46 free read)"
  fail=1
fi
if ! grep -q 'freeTierHint\|dataopsPro' "$FE/src/features/workspace/components/ActiveSessionsPanel.vue"; then
  echo "FAIL: ActiveSessionsPanel free-tier banner missing (Wave 46)"
  fail=1
fi
if ! grep -q "guardPack('pack.dataops'" "$FE/src/features/workspace/components/LockWaitsPanel.vue"; then
  echo "FAIL: LockWaitsPanel must guardPack dataops (Wave 36/46)"
  fail=1
fi
if [[ ! -f "$FE/src/features/pack/services/pack-store-persona.ts" ]]; then
  echo "FAIL: pack-store-persona missing (Wave 36)"
  fail=1
fi
if ! grep -q 'orderSuitesForPersona\|pack-store-persona' "$FE/src/features/pack/components/PackStorePanel.vue"; then
  echo "FAIL: PackStorePanel must use persona suite ordering (Wave 36)"
  fail=1
fi
if ! grep -q "persona:" "$FE/src/i18n/locales/zh-CN/pack.ts"; then
  echo "FAIL: zh-CN pack.persona keys missing (Wave 36)"
  fail=1
fi
if [[ ! -f "$FE/src/core/data-grid/services/grid-export-entitlement.ts" ]]; then
  echo "FAIL: grid-export-entitlement missing (Wave 37)"
  fail=1
fi
if ! grep -q 'FREE_GRID_EXPORT_MAX_ROWS' "$FE/src/core/data-grid/services/grid-export-entitlement.ts"; then
  echo "FAIL: FREE_GRID_EXPORT_MAX_ROWS missing (Wave 37)"
  fail=1
fi
if ! grep -q 'resolveFreeGridExportRows' "$FE/src/core/data-grid/composables/useDataGridExport.ts"; then
  echo "FAIL: useDataGridExport must resolve free export row cap (Wave 37)"
  fail=1
fi
if [[ ! -f "$FE/src/features/pack/services/governance-diff-preview.ts" ]]; then
  echo "FAIL: governance-diff-preview missing (Wave 37)"
  fail=1
fi
if ! grep -q 'limitSchemaCompareTableDiffs' "$FE/src/features/workspace/components/tabs/SchemaCompareTab.vue"; then
  echo "FAIL: SchemaCompareTab must limit preview diffs (Wave 37)"
  fail=1
fi
if ! grep -q 'limitQueryResultDiffRows' "$FE/src/features/workspace/components/tabs/CrossEnvCompareTab.vue"; then
  echo "FAIL: CrossEnvCompareTab must limit preview diffs (Wave 37)"
  fail=1
fi
if ! grep -q 'exportFreeRowCap' "$FE/src/i18n/locales/zh-CN/dataGrid.ts"; then
  echo "FAIL: zh-CN dataGrid.exportFreeRowCap missing (Wave 37)"
  fail=1
fi
if ! grep -q "'export.rowCap'" "$FE/src/i18n/locales/zh-CN/pack.ts"; then
  echo "FAIL: zh-CN pack.paywall.context.export.rowCap missing (Wave 37)"
  fail=1
fi
if [[ ! -f "$FE/src/features/workspace/services/sql-history-retention.ts" ]]; then
  echo "FAIL: sql-history-retention missing (Wave 38)"
  fail=1
fi
if ! grep -q 'FREE_SQL_HISTORY_MAX_ENTRIES\|SqlHistoryLimits' \
  "$ROOT/datawise-backend/datawise-config/src/main/java/org/apache/datawise/backend/configstore/SqlHistoryLimits.java"; then
  echo "FAIL: SqlHistoryLimits missing (Wave 38)"
  fail=1
fi
if ! grep -q 'trimUserHistory' \
  "$ROOT/datawise-backend/datawise-config/src/main/java/org/apache/datawise/backend/configstore/FileSqlHistoryStore.java"; then
  echo "FAIL: FileSqlHistoryStore must trim history (Wave 38)"
  fail=1
fi
if ! grep -q 'hasExplainProAccess' "$FE/src/features/workspace/components/ExplainPlanTree.vue"; then
  echo "FAIL: ExplainPlanTree must gate explain pro (Wave 38)"
  fail=1
fi
if ! grep -q 'isSwitchEnabled' "$FE/src/features/workspace/components/QueryResultPane.vue"; then
  echo "FAIL: QueryResultPane must soft-gate result diff (Wave 38)"
  fail=1
fi
if ! grep -q 'explainProUnlock' "$FE/src/i18n/locales/zh-CN/queryResult.ts"; then
  echo "FAIL: zh-CN queryResult.explainProUnlock missing (Wave 38)"
  fail=1
fi
if [[ ! -f "$FE/src/features/pack/services/dev-productivity-entitlement.ts" ]]; then
  echo "FAIL: dev-productivity-entitlement missing (Wave 39)"
  fail=1
fi
if ! grep -q 'guardDevProductivity' "$FE/src/features/pack/stores/entitlement-store.ts"; then
  echo "FAIL: entitlement-store missing guardDevProductivity (Wave 39)"
  fail=1
fi
if ! grep -q 'isDevProductivityPlugin' "$FE/src/features/plugin/stores/plugin-store.ts"; then
  echo "FAIL: plugin-store must gate Dev productivity plugins (Wave 39)"
  fail=1
fi
if ! grep -q 'showAiSample\|sampleSql' "$FE/src/features/pack/components/PackPaywallDialog.vue"; then
  echo "FAIL: PackPaywallDialog must show AI success sample (Wave 39)"
  fail=1
fi
if ! grep -q 'sampleTitle' "$FE/src/i18n/locales/zh-CN/pack.ts"; then
  echo "FAIL: zh-CN pack.paywall.sampleTitle missing (Wave 39)"
  fail=1
fi
if ! grep -q 'gridEditProRequired' "$FE/src/i18n/locales/zh-CN/dataGrid.ts"; then
  echo "FAIL: zh-CN dataGrid.gridEditProRequired missing (Wave 39)"
  fail=1
fi
if ! grep -q 'claimSiteProTrial' "$FE/src/features/pack/stores/entitlement-store.ts"; then
  echo "FAIL: entitlement-store missing claimSiteProTrial (Wave 40)"
  fail=1
fi
if ! grep -q 'site-pro-trial\|siteProTrial' "$FE/src/shared/api/http/paths.ts"; then
  echo "FAIL: packs API path missing site Pro trial (Wave 40)"
  fail=1
fi
if ! grep -q "guardPack('pack.security'" "$FE/src/features/team/components/panels/TeamAuditPanel.vue"; then
  echo "FAIL: TeamAuditPanel must gate full SQL export (Wave 40)"
  fail=1
fi
if ! grep -q 'ctaSiteProTrial\|siteProTrialHint' "$FE/src/i18n/locales/zh-CN/pack.ts"; then
  echo "FAIL: zh-CN site Pro trial copy missing (Wave 40)"
  fail=1
fi
if [[ ! -f "$FE/src/features/pack/services/governance-compare-report.ts" ]]; then
  echo "FAIL: governance-compare-report missing (Wave 41)"
  fail=1
fi
if ! grep -q 'exportSchemaCompareReport\|gov.schema.report' \
  "$FE/src/features/workspace/components/tabs/SchemaCompareTab.vue"; then
  echo "FAIL: SchemaCompareTab must export full governance report (Wave 41)"
  fail=1
fi
if ! grep -q 'exportCrossEnvCompareReport\|gov.crossEnv.report' \
  "$FE/src/features/workspace/components/tabs/CrossEnvCompareTab.vue"; then
  echo "FAIL: CrossEnvCompareTab must export full governance report (Wave 41)"
  fail=1
fi
if ! grep -q "'gov.schema.report'" "$FE/src/i18n/locales/zh-CN/pack.ts"; then
  echo "FAIL: zh-CN pack.paywall.context.gov.schema.report missing (Wave 41)"
  fail=1
fi
if ! grep -q 'exportReport' "$FE/src/i18n/locales/zh-CN/schemaCompare.ts"; then
  echo "FAIL: zh-CN schemaCompare.exportReport missing (Wave 41)"
  fail=1
fi
if ! grep -q 'autoClaimTenantProTrial\|auto-claim-tenant-pro-trial' \
  "$ROOT/datawise-backend/datawise-config/src/main/java/org/apache/datawise/backend/config/EntitlementProperties.java"; then
  echo "FAIL: EntitlementProperties missing autoClaimTenantProTrial (Wave 42)"
  fail=1
fi
if ! grep -q 'tenantPackLicense' \
  "$ROOT/datawise-backend/datawise-config/src/main/java/org/apache/datawise/backend/configstore/ConfigPaths.java"; then
  echo "FAIL: ConfigPaths.tenantPackLicense missing (Wave 42)"
  fail=1
fi
if ! grep -q 'autoClaimTenantProTrialIfEnabled' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/server/pack/EntitlementService.java"; then
  echo "FAIL: EntitlementService missing autoClaimTenantProTrialIfEnabled (Wave 42)"
  fail=1
fi
if ! grep -q 'TenantLifecycleListener' \
  "$ROOT/datawise-backend/datawise-config/src/main/java/org/apache/datawise/backend/service/tenant/TenantService.java"; then
  echo "FAIL: TenantService must notify TenantLifecycleListener (Wave 42)"
  fail=1
fi
if ! grep -q 'TenantProTrialBootstrap' \
  "$ROOT/datawise-backend/datawise-server/src/main/java/org/apache/datawise/backend/server/pack/TenantProTrialBootstrap.java"; then
  echo "FAIL: TenantProTrialBootstrap missing (Wave 42)"
  fail=1
fi
if ! grep -q 'auto-claim-tenant-pro-trial:\s*false' \
  "$ROOT/datawise-backend/datawise-server/src/main/resources/application.yml"; then
  echo "FAIL: auto-claim-tenant-pro-trial must default false (Wave 42)"
  fail=1
fi
if ! grep -q 'tenant-pro-trial-days:\s*14' \
  "$ROOT/datawise-backend/datawise-server/src/main/resources/application.yml"; then
  echo "FAIL: tenant-pro-trial-days must default to 14 (Wave 42)"
  fail=1
fi
if ! grep -q 'isBackupEntitled\|sanitizeAdHocRun' \
  "$ROOT/datawise-backend/datawise-backup/src/main/java/org/apache/datawise/backend/controller/backup/BackupController.java"; then
  echo "FAIL: BackupController free ad-hoc path missing (Wave 43)"
  fail=1
fi
if ! grep -q 'backupPro\|backup.schedule\|freeTierHint' \
  "$FE/src/features/settings/components/BackupCenterSettingsPanel.vue"; then
  echo "FAIL: BackupCenterSettingsPanel must soft-gate schedule/restore (Wave 43)"
  fail=1
fi
if ! grep -q 'onTrial\|dbTypeTrial' "$FE/src/features/explorer/components/DbTypeContextPanel.vue"; then
  echo "FAIL: DbTypeContextPanel must offer connector trial CTA (Wave 43)"
  fail=1
fi
if ! grep -q "'backup.schedule'" "$FE/src/i18n/locales/zh-CN/pack.ts"; then
  echo "FAIL: zh-CN pack.paywall.context.backup.schedule missing (Wave 43)"
  fail=1
fi
if ! grep -q 'freeTierHint' "$FE/src/i18n/locales/zh-CN/backupCenter.ts"; then
  echo "FAIL: zh-CN backupCenter.freeTierHint missing (Wave 43)"
  fail=1
fi
CLOUD_YML="$ROOT/datawise-backend/datawise-server/src/main/resources/application-cloud.yml"
if [[ ! -f "$CLOUD_YML" ]] || ! grep -q 'auto-claim-tenant-pro-trial:\s*true' "$CLOUD_YML"; then
  echo "FAIL: application-cloud.yml auto-claim missing (Wave 44)"
  fail=1
fi
if ! grep -q 'showMigrationTrialBanner\|migration-trial-banner' \
  "$FE/src/features/workspace/components/migration/MigrationPreflightStep.vue"; then
  echo "FAIL: MigrationPreflightStep trial banner missing (Wave 44)"
  fail=1
fi
if ! grep -q 'trialBanner' "$FE/src/i18n/locales/zh-CN/explorer.ts"; then
  echo "FAIL: zh-CN explorer.tableMigrationWizard.trialBanner missing (Wave 44)"
  fail=1
fi
if ! grep -q 'openHtmlPrintDialog\|openPrintDialog' \
  "$FE/src/features/pack/services/governance-compare-report.ts"; then
  echo "FAIL: governance PDF print path missing (Wave 45)"
  fail=1
fi
if ! grep -q 'TrialEndingBanner' "$FE/src/app/AppShell.vue"; then
  echo "FAIL: TrialEndingBanner not mounted (Wave 45)"
  fail=1
fi
if ! grep -q 'trialEnding' "$FE/src/i18n/locales/zh-CN/pack.ts"; then
  echo "FAIL: zh-CN pack.trialEnding missing (Wave 45)"
  fail=1
fi
if ! grep -q 'PackAuditPanel' "$FE/src/features/pack/components/PackStorePanel.vue"; then
  echo "FAIL: PackAuditPanel not mounted in store (Wave 46)"
  fail=1
fi
if ! grep -q 'lock.analysis' "$FE/src/i18n/locales/zh-CN/pack.ts"; then
  echo "FAIL: zh-CN pack.paywall.context.lock.analysis missing (Wave 46)"
  fail=1
fi
if ! grep -q 'heartbeatConfigured\|heartbeatAt' \
  "$FE/src/features/pack/services/pack-entitlement.normalize.ts"; then
  echo "FAIL: entitlement normalize missing heartbeat fields (Wave 47)"
  fail=1
fi
if ! grep -q 'showEntitlementChip\|status-bar__entitlement' \
  "$FE/src/features/layout/components/StatusBar.vue"; then
  echo "FAIL: StatusBar entitlement chip missing (Wave 47)"
  fail=1
fi
if [[ ! -f "$ROOT/scripts/pack/security-retest.sh" ]]; then
  echo "FAIL: security-retest.sh missing (Wave 48)"
  fail=1
fi
if ! grep -q "pack-suite__tips" "$FE/src/features/pack/components/PackStorePanel.vue"; then
  echo "FAIL: PackStorePanel missing sales tips (Wave 19)"
  fail=1
fi

if [[ -n "${DIST_DIR:-}" ]]; then
  echo "== dist scan: $DIST_DIR =="
  if [[ ! -d "$DIST_DIR" ]]; then
    echo "FAIL: DIST_DIR not a directory: $DIST_DIR"
    fail=1
  else
    for m in "${MARKERS[@]}"; do
      if grep -R --binary-files=without-match -F "$m" "$DIST_DIR" >/dev/null 2>&1; then
        echo "FAIL: Standard dist contains forbidden marker: $m"
        fail=1
      else
        echo "OK absent: $m"
      fi
    done
    if [[ "${STANDARD_DIST:-}" == "1" ]]; then
      if find "$DIST_DIR" -type f \( -name '*pack-ai*' -o -name '*AiWorkbench*' \) 2>/dev/null \
        | grep -v 'AiWorkbenchStub' | grep -q .; then
        echo "FAIL: Standard dist still contains pack-ai / AiWorkbench assets"
        fail=1
      else
        echo "OK: no pack-ai / AiWorkbench assets in Standard dist"
      fi
      if find "$DIST_DIR" -type f \( -name '*TableMigrationTab*' -o -name '*BackupCenterSettingsPanel*' -o -name '*MigrationTasksPanel*' \) 2>/dev/null | grep -q .; then
        echo "FAIL: Standard dist still contains migration/backup panel chunks (Wave 23)"
        find "$DIST_DIR" -type f \( -name '*TableMigrationTab*' -o -name '*BackupCenterSettingsPanel*' -o -name '*MigrationTasksPanel*' \) 2>/dev/null | head -n 20
        fail=1
      else
        echo "OK: no TableMigrationTab / BackupCenter / MigrationTasksPanel chunks (Wave 23)"
      fi
      if find "$DIST_DIR" -type f \( \
          -name '*SchemaCompareTab*' -o -name '*CrossEnvCompareTab*' -o -name '*MetadocTab*' \
          -o -name '*ViewModelLineageTab*' -o -name '*LineageGraphPanel*' -o -name '*MigrationWizardSteps*' \
        \) 2>/dev/null | grep -v Stub | grep -q .; then
        echo "FAIL: Standard dist still contains governance/lineage/metadoc chunks (Wave 24)"
        find "$DIST_DIR" -type f \( \
          -name '*SchemaCompareTab*' -o -name '*CrossEnvCompareTab*' -o -name '*MetadocTab*' \
          -o -name '*ViewModelLineageTab*' -o -name '*LineageGraphPanel*' -o -name '*MigrationWizardSteps*' \
        \) 2>/dev/null | grep -v Stub | head -n 20
        fail=1
      else
        echo "OK: no SchemaCompare / CrossEnv / Metadoc / Lineage / MigrationWizardSteps chunks (Wave 24)"
      fi
      if find "$DIST_DIR" -type f \( \
          -name '*SqlMonitorPanel*' -o -name '*ActiveSessionsPanel*' -o -name '*LockWaitsPanel*' \
          -o -name '*FakeDataDialog*' \
        \) 2>/dev/null | grep -v Stub | grep -q .; then
        echo "FAIL: Standard dist still contains dataops/datagen UI chunks (Wave 25)"
        find "$DIST_DIR" -type f \( \
          -name '*SqlMonitorPanel*' -o -name '*ActiveSessionsPanel*' -o -name '*LockWaitsPanel*' \
          -o -name '*FakeDataDialog*' \
        \) 2>/dev/null | grep -v Stub | head -n 20
        fail=1
      else
        echo "OK: no SqlMonitor / FakeDataDialog chunks (Wave 25)"
      fi
      if find "$DIST_DIR" -type f -name '*ViewModelLineagePreviewPanel*' 2>/dev/null | grep -v Stub | grep -q .; then
        echo "FAIL: Standard dist still contains ViewModelLineagePreviewPanel chunk (Wave 26)"
        fail=1
      else
        echo "OK: no ViewModelLineagePreviewPanel chunk (Wave 26)"
      fi
      if find "$DIST_DIR" -type f \( \
          -name '*FederatedViewWizardDialog*' -o -name '*AnalysisCanvasRerunDialog*' \
        \) 2>/dev/null | grep -v Stub | grep -q .; then
        echo "FAIL: Standard dist still contains platform AI dialog chunks (Wave 32)"
        fail=1
      else
        echo "OK: no FederatedViewWizard / AnalysisCanvasRerun chunks (Wave 32)"
      fi
      if find "$DIST_DIR" -type f -name '*.map' 2>/dev/null | grep -q .; then
        echo "FAIL: Standard dist contains source maps (*.map)"
        fail=1
      else
        echo "OK: no source maps in Standard dist"
      fi
    fi
  fi
else
  echo "== dist scan skipped (set DIST_DIR=.../dist to enable) =="
fi

if [[ "$fail" -ne 0 ]]; then
  echo "frontend pack scan FAILED"
  exit 1
fi
echo "frontend pack scan OK"
