#!/usr/bin/env bash
# Generate sample pack scaffolds (Wave 15). Idempotent.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

scaffold() {
  local dir="$1" id="$2" pkg="$3" contrib="$4" probe="$5"
  shift 5
  local caps_json="$1" plugins_json="$2" eps_json="$3"

  local base="$ROOT/packs/$dir"
  local src="$base/module-src/org/apache/datawise/pack/$pkg"
  local meta="$base/module-src/META-INF/services"
  mkdir -p "$src" "$meta" "$base/backend"

  cat > "$base/manifest.json" <<EOF
{
  "schemaVersion": 1,
  "packId": "$id",
  "version": "1.0.0-dev",
  "minCoreVersion": "4.1.0",
  "maxCoreVersion": "4.99.99",
  "capabilities": $caps_json,
  "plugins": $plugins_json,
  "extensionPoints": $eps_json,
  "requiresRestart": false,
  "channel": "stable"
}
EOF

  cat > "$src/$contrib.java" <<EOF
package org.apache.datawise.pack.$pkg;

import org.apache.datawise.backend.common.pack.PackModuleContributor;
import org.apache.datawise.backend.common.pack.PackModuleRegistration;

/** Sample contributor for $id — registers health probe. */
public final class $contrib implements PackModuleContributor {

    @Override
    public String moduleId() {
        return "$id";
    }

    @Override
    public void contribute(PackModuleRegistration registration) {
        registration.registerSingleton("health", $probe.class, new $probe());
    }
}
EOF

  cat > "$src/$probe.java" <<EOF
package org.apache.datawise.pack.$pkg;

public final class $probe {

    public String status() {
        return "ok";
    }

    public String packId() {
        return "$id";
    }
}
EOF

  echo "org.apache.datawise.pack.$pkg.$contrib" \
    > "$meta/org.apache.datawise.backend.common.pack.PackModuleContributor"

  printf '%s\n' "# Placeholder — sealed $id modules in release builds." "$id backend stub" \
    > "$base/backend/README.txt"

  cat > "$base/README.md" <<EOF
# Sample $id Pack

Scaffold with a \`PackModuleContributor\` health probe.

\`\`\`bash
bash scripts/pack/build-pack-module.sh $dir
bash scripts/pack/sign-all-samples.sh
\`\`\`
EOF

  echo "OK packs/$dir"
}

scaffold pack-governance pack.governance governance PackGovernanceModuleContributor PackGovernanceHealthProbe \
  '["gov.schema.compare","gov.cross.env","gov.result.diff"]' \
  '["p-schema-compare","p-cross-env-compare","p-result-diff"]' \
  '["plugin.schemaCompare","plugin.resultDiff"]'

scaffold pack-lineage pack.lineage lineage PackLineageModuleContributor PackLineageHealthProbe \
  '["lineage.parse","lineage.impact"]' \
  '[]' \
  '["explorer.lineage","api.lineage"]'

scaffold pack-dataops pack.dataops dataops PackDataopsModuleContributor PackDataopsHealthProbe \
  '["ops.monitor","ops.lock","ops.kill","ops.explain.pro"]' \
  '["p-sql-monitor"]' \
  '["plugin.sqlMonitor","console.ops"]'

scaffold pack-datagen pack.datagen datagen PackDatagenModuleContributor PackDatagenHealthProbe \
  '["datagen.fake"]' \
  '["p-fake-data"]' \
  '["plugin.fakeData"]'

scaffold pack-security pack.security security PackSecurityModuleContributor PackSecurityHealthProbe \
  '["security.export.mask","security.audit.pro","security.webhook"]' \
  '["p-export-mask"]' \
  '["plugin.exportMask","settings.security"]'

# Connector commercial packs (Wave 16)
scaffold pack-connector-enterprise pack.connector.enterprise connectorenterprise \
  PackConnectorEnterpriseModuleContributor PackConnectorEnterpriseHealthProbe \
  '["connector.enterprise"]' \
  '[]' \
  '["marketplace.connector.enterprise"]'

scaffold pack-connector-domestic pack.connector.domestic connectordomestic \
  PackConnectorDomesticModuleContributor PackConnectorDomesticHealthProbe \
  '["connector.domestic"]' \
  '[]' \
  '["marketplace.connector.domestic"]'

scaffold pack-connector-bigdata pack.connector.bigdata connectorbigdata \
  PackConnectorBigdataModuleContributor PackConnectorBigdataHealthProbe \
  '["connector.bigdata"]' \
  '[]' \
  '["marketplace.connector.bigdata"]'
