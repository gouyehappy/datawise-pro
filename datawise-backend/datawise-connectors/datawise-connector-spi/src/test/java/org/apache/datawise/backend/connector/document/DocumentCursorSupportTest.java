package org.apache.datawise.backend.connector.document;

import org.apache.datawise.backend.common.TableDataException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DocumentCursorSupportTest {

    @Test
    void parseOffsetAcceptsBoundaryValues() {
        assertEquals(0, DocumentCursorSupport.parseOffset(DocumentCursorSupport.OFFSET_PREFIX + "0"));
        assertEquals(
                DocumentCursorSupport.MAX_OFFSET,
                DocumentCursorSupport.parseOffset(DocumentCursorSupport.OFFSET_PREFIX + DocumentCursorSupport.MAX_OFFSET));
    }

    @Test
    void parseOffsetRejectsDeepPaging() {
        String cursor = DocumentCursorSupport.OFFSET_PREFIX + (DocumentCursorSupport.MAX_OFFSET + 1);
        TableDataException ex = assertThrows(TableDataException.class, () -> DocumentCursorSupport.parseOffset(cursor));
        assertEquals(DocumentCursorSupport.OFFSET_LIMIT_EXCEEDED, ex.getErrorCode());
        assertTrue(ex.getMessage().contains(String.valueOf(DocumentCursorSupport.MAX_OFFSET)));
    }

    @Test
    void requireOffsetInRangeRejectsNegative() {
        assertThrows(IllegalArgumentException.class, () -> DocumentCursorSupport.requireOffsetInRange(-1));
    }
}
