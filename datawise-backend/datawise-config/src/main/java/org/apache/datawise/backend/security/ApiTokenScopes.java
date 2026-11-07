package org.apache.datawise.backend.security;

public final class ApiTokenScopes {

    public static final String MIGRATION = "migration";
    public static final String SQL = "sql";
    /** Connector market install/uninstall + offline runtime zip import (headless-cli). */
    public static final String RUNTIME = "runtime";

    private ApiTokenScopes() {
    }
}
