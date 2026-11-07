package org.apache.datawise.backend.common;

/**
 * Interactive SQL cursor OFFSET exceeds the configured deep-pagination ceiling.
 * Maps to {@link DatawiseErrorCodes#SQL_CURSOR_OFFSET_LIMIT}.
 */
public class SqlDeepOffsetException extends RuntimeException {

    public static final String CODE = DatawiseErrorCodes.SQL_CURSOR_OFFSET_LIMIT;

    public SqlDeepOffsetException(int offset, int maxOffset) {
        super("SQL cursor offset " + offset + " exceeds maximum " + maxOffset
                + ". Refine the query (WHERE / keyset) instead of deep OFFSET paging.");
    }
}
