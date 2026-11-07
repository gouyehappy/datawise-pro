package org.apache.datawise.backend.connector.document;

import org.apache.datawise.backend.common.TableDataException;

/** Shared cursor id format for document-store table data pagination. */
public final class DocumentCursorSupport {

    public static final String OFFSET_PREFIX = "mongo-offset:";

    /**
     * Hard cap on {@code skip}/{@code offset} for document stores.
     * Deep offsets scan discarded rows on every page and degrade quickly.
     */
    public static final int MAX_OFFSET = 100_000;

    public static final String OFFSET_LIMIT_EXCEEDED = "TABLE_DATA_OFFSET_LIMIT";

    private DocumentCursorSupport() {
    }

    public static boolean isOffsetCursor(String cursorId) {
        return cursorId != null && cursorId.startsWith(OFFSET_PREFIX);
    }

    public static int parseOffset(String cursorId) {
        if (!isOffsetCursor(cursorId)) {
            throw new TableDataException("Invalid document table data cursor", TableDataException.FETCH_FAILED);
        }
        try {
            int offset = Integer.parseInt(cursorId.substring(OFFSET_PREFIX.length()));
            requireOffsetInRange(offset);
            return offset;
        } catch (NumberFormatException ex) {
            throw new TableDataException("Invalid document table data cursor", TableDataException.FETCH_FAILED, ex);
        }
    }

    /** Rejects negative or deep offsets before issuing a store {@code skip}. */
    public static void requireOffsetInRange(int offset) {
        if (offset < 0) {
            throw new IllegalArgumentException("offset must be >= 0");
        }
        if (offset > MAX_OFFSET) {
            throw new TableDataException(
                    "Document table data offset exceeds maximum of " + MAX_OFFSET
                            + "; narrow with a filter instead of deep paging",
                    OFFSET_LIMIT_EXCEEDED);
        }
    }
}
