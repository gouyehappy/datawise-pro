package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "datawise.sql.rewrite")
public class SqlRewriteProperties {

    /**
     * When enabled, console SQL is parsed and table/column identifiers are quoted
     * according to connection dbType before execution.
     */
    private boolean quoteIdentifiers = true;

    public boolean isQuoteIdentifiers() {
        return quoteIdentifiers;
    }

    public void setQuoteIdentifiers(boolean quoteIdentifiers) {
        this.quoteIdentifiers = quoteIdentifiers;
    }
}
