package org.apache.datawise.sqlflow.dialect;

import java.util.Locale;

/**
 * SQLFlow vendor token (matches Gudu {@code /t} option values).
 * See https://docs.sqlparser.com/reference/configuration/
 */
public enum SqlFlowDialect {

    ACCESS("access"),
    BIGQUERY("bigquery"),
    DB2("db2"),
    GREENPLUM("greenplum"),
    HANA("hana"),
    HIVE("hive"),
    IMPALA("impala"),
    MDX("mdx"),
    MSSQL("mssql"),
    MYSQL("mysql"),
    NETEZZA("netezza"),
    ODBC("odbc"),
    OPENEDGE("openedge"),
    ORACLE("oracle"),
    POSTGRESQL("postgresql"),
    REDSHIFT("redshift"),
    SNOWFLAKE("snowflake"),
    SYBASE("sybase"),
    TERADATA("teradata"),
    VERTICA("vertica"),
    GENERIC("odbc");

    private final String vendorToken;

    SqlFlowDialect(String vendorToken) {
        this.vendorToken = vendorToken;
    }

    public String vendorToken() {
        return vendorToken;
    }

    public static SqlFlowDialect fromVendorToken(String token) {
        if (token == null || token.isBlank()) {
            return GENERIC;
        }
        String normalized = token.trim().toLowerCase(Locale.ROOT);
        if ("sqlserver".equals(normalized)) {
            normalized = "mssql";
        }
        if ("postgres".equals(normalized)) {
            normalized = "postgresql";
        }
        for (SqlFlowDialect dialect : values()) {
            if (dialect.vendorToken.equals(normalized) || dialect.name().equalsIgnoreCase(normalized)) {
                return dialect;
            }
        }
        return GENERIC;
    }
}
