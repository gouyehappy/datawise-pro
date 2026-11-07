package org.apache.datawise.backend.lineage.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "lineage")
public class LineageProperties {

    private int maxDepth = 3;
    private final Calcite calcite = new Calcite();

    public int getMaxDepth() {
        return maxDepth;
    }

    public void setMaxDepth(int maxDepth) {
        this.maxDepth = maxDepth;
    }

    public Calcite getCalcite() {
        return calcite;
    }

    public static class Calcite {
        private boolean enabled;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }
    }
}
