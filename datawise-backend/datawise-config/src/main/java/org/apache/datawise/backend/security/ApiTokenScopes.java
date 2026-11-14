package org.apache.datawise.backend.security;

public final class ApiTokenScopes {

    public static final String MIGRATION = "migration";
    /** Read-only SQL: SELECT, metadata, explain, export. Never unlocks DDL/DML. */
    public static final String SQL = "sql";
    /**
     * Write SQL: DDL/DML plus Explorer destructive actions. Implies {@link #SQL}.
     * Kept separate so a leaked read-only token cannot mutate data.
     */
    public static final String SQL_WRITE = "sql:write";
    /** Connector market install/uninstall + offline runtime zip import (headless-cli). */
    public static final String RUNTIME = "runtime";
    /** Host PTY / util.terminal (never implied by sql/migration/runtime). */
    public static final String TERMINAL = "terminal";

    private ApiTokenScopes() {
    }
}
