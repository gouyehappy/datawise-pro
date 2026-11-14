package org.apache.datawise.backend.common;

/**
 * Stable client-facing error codes shared by REST and AI SSE payloads.
 */
public final class DatawiseErrorCodes {

    public static final String UNAUTHORIZED = UnauthorizedException.CODE;
    public static final String FORBIDDEN = "FORBIDDEN";
    public static final String INTERNAL_ERROR = "INTERNAL_ERROR";
    public static final String BAD_REQUEST = "BAD_REQUEST";
    /** Login failure throttle lockout (stable client code). */
    public static final String LOGIN_LOCKED = "LOGIN_LOCKED";
    public static final String SQL_EXECUTION_FAILED = "SQL_EXECUTION_FAILED";
    public static final String SQL_QUERY_TIMEOUT = "SQL_QUERY_TIMEOUT";
    /** Interactive SQL rejected: global or per-user in-flight limit. */
    public static final String SQL_CONCURRENCY_LIMIT = "SQL_CONCURRENCY_LIMIT";
    /** Manual console JDBC session missing / closed. */
    public static final String SQL_SESSION_GONE = "SQL_SESSION_GONE";
    /** Result cursor missing / expired / wrong owner. */
    public static final String SQL_CURSOR_GONE = "SQL_CURSOR_GONE";
    /** Cursor / table page OFFSET exceeds configured deep-pagination ceiling. */
    public static final String SQL_CURSOR_OFFSET_LIMIT = "SQL_CURSOR_OFFSET_LIMIT";
    public static final String IO_ERROR = "IO_ERROR";
    public static final String QUERY_ROW_LIMIT = "QUERY_ROW_LIMIT";

    public static final String EXPLORER_CONNECTION = "EXPLORER_CONNECTION";
    public static final String TABLE_DATA = "TABLE_DATA";
    public static final String DATABASE_SERVICE = "DATABASE_SERVICE";
    public static final String DDL = "DDL";
    public static final String CONNECTION_ACCESS_DENIED = ConnectionAccessDeniedException.CODE;
    public static final String SQL_PRODUCTION_APPROVAL_REQUIRED = ProductionWriteBlockedException.CODE;

    public static final String LICENSE_REQUIRED = "LICENSE_REQUIRED";
    public static final String LICENSE_EXPIRED = "LICENSE_EXPIRED";
    public static final String LICENSE_MISMATCH = "LICENSE_MISMATCH";
    /** License file exists but cannot be parsed (distinct from "no license installed"). */
    public static final String LICENSE_CORRUPT = "LICENSE_CORRUPT";
    public static final String CONNECTION_CATALOG_CONFLICT = "CONNECTION_CATALOG_CONFLICT";
    public static final String PACK_NOT_INSTALLED = "PACK_NOT_INSTALLED";
    public static final String PACK_INTEGRITY_FAILED = "PACK_INTEGRITY_FAILED";
    public static final String CORE_VERSION_INCOMPATIBLE = "CORE_VERSION_INCOMPATIBLE";
    public static final String QUOTA_EXCEEDED = "QUOTA_EXCEEDED";
    /** Organization connection count hard cap (Wave 32). */
    public static final String CONNECTION_QUOTA_EXCEEDED = "CONNECTION_QUOTA_EXCEEDED";

    /** Connector plugin not loaded in the current runtime (e.g. slim/core package). */
    public static final String DATASOURCE_NOT_AVAILABLE = "DATASOURCE_NOT_AVAILABLE";
    public static final String DATASOURCE_TYPE_REQUIRED = "DATASOURCE_TYPE_REQUIRED";

    /** Interactive SQL / scheduled task write audit failed to persist. */
    public static final String SQL_AUDIT_FAILED = "SQL_AUDIT_FAILED";
    /** Maker-checker: requester cannot approve/reject their own production SQL. */
    public static final String MAKER_CHECKER_SELF_APPROVE = "MAKER_CHECKER_SELF_APPROVE";
    /** Team audit list/export restricted to owner/admin. */
    public static final String TEAM_AUDIT_FORBIDDEN = "TEAM_AUDIT_FORBIDDEN";
    /** Shared SQL query optimistic-lock conflict — client should pull latest. */
    public static final String SHARED_QUERY_CONFLICT = "SHARED_QUERY_CONFLICT";

    private DatawiseErrorCodes() {
    }
}
