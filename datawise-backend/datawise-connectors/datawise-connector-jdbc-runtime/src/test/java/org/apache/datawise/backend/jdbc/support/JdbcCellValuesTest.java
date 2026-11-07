package org.apache.datawise.backend.jdbc.support;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.sql.Blob;
import java.sql.Clob;
import java.sql.Date;
import java.sql.SQLXML;
import java.sql.Time;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JdbcCellValuesTest {

    @Test
    void normalize_keepsScalars() {
        assertEquals("hello", JdbcCellValues.normalize("hello"));
        assertEquals(42, JdbcCellValues.normalize(42));
        assertEquals(true, JdbcCellValues.normalize(true));
    }

    @Test
    void normalize_stringifiesUnsafeLongAndBigInteger() {
        assertEquals(42L, JdbcCellValues.normalize(42L));
        assertEquals(JdbcCellValues.JS_MAX_SAFE_INTEGER, JdbcCellValues.normalize(JdbcCellValues.JS_MAX_SAFE_INTEGER));
        long unsafe = JdbcCellValues.JS_MAX_SAFE_INTEGER + 1;
        assertEquals(Long.toString(unsafe), JdbcCellValues.normalize(unsafe));
        assertEquals(
                "485299014926434304",
                JdbcCellValues.normalize(new BigInteger("485299014926434304"))
        );
        assertEquals("1.50", JdbcCellValues.normalize(new BigDecimal("1.50")));
    }

    @Test
    void normalize_capsLargeByteArrays() {
        byte[] bytes = new byte[JdbcCellValues.MAX_BYTES_HEX + 8];
        for (int i = 0; i < bytes.length; i++) {
            bytes[i] = (byte) (i & 0xff);
        }
        Object normalized = JdbcCellValues.normalize(bytes);
        String text = String.valueOf(normalized);
        assertTrue(text.contains("(" + bytes.length + " bytes)"));
        assertTrue(text.length() < bytes.length * 2);
    }

    @Test
    void normalize_capsBlobPreview() throws Exception {
        byte[] bytes = new byte[JdbcCellValues.MAX_BYTES_HEX + 16];
        for (int i = 0; i < bytes.length; i++) {
            bytes[i] = (byte) (i & 0xff);
        }
        Blob blob = mock(Blob.class);
        when(blob.length()).thenReturn((long) bytes.length);
        when(blob.getBytes(1, JdbcCellValues.MAX_BYTES_HEX)).thenReturn(
                java.util.Arrays.copyOf(bytes, JdbcCellValues.MAX_BYTES_HEX)
        );

        String text = String.valueOf(JdbcCellValues.normalize(blob));
        assertTrue(text.contains("(" + bytes.length + " bytes)"));
    }

    @Test
    void normalize_capsClobAndSqlXml() throws Exception {
        String longText = "x".repeat(JdbcCellValues.MAX_TEXT_CHARS + 32);
        Clob clob = mock(Clob.class);
        when(clob.length()).thenReturn((long) longText.length());
        when(clob.getSubString(1, JdbcCellValues.MAX_TEXT_CHARS)).thenReturn(
                longText.substring(0, JdbcCellValues.MAX_TEXT_CHARS)
        );
        String clobText = String.valueOf(JdbcCellValues.normalize(clob));
        assertTrue(clobText.contains("(" + longText.length() + " chars)"));

        SQLXML xml = mock(SQLXML.class);
        when(xml.getString()).thenReturn(longText);
        String xmlText = String.valueOf(JdbcCellValues.normalize(xml));
        assertTrue(xmlText.contains("(" + longText.length() + " chars)"));
    }

    @Test
    void normalize_capsNestedCollectionSizeAndDepth() {
        List<Object> items = new ArrayList<>();
        for (int i = 0; i < JdbcCellValues.MAX_COLLECTION_ELEMENTS + 5; i++) {
            items.add(i);
        }
        Object normalizedList = JdbcCellValues.normalize(items);
        assertInstanceOf(List.class, normalizedList);
        @SuppressWarnings("unchecked")
        List<Object> list = (List<Object>) normalizedList;
        assertEquals(JdbcCellValues.MAX_COLLECTION_ELEMENTS + 1, list.size());
        assertTrue(String.valueOf(list.get(list.size() - 1)).contains("items"));

        Object deep = "leaf";
        for (int i = 0; i < JdbcCellValues.MAX_NESTING_DEPTH + 3; i++) {
            deep = List.of(deep);
        }
        String deepText = String.valueOf(JdbcCellValues.normalize(deep));
        assertTrue(deepText.contains("max depth"));
    }

    @Test
    void normalize_mapsNestedStructures() {
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("source", "doc");
        input.put("tags", List.of("a", "b"));

        Object normalized = JdbcCellValues.normalize(input);
        assertInstanceOf(Map.class, normalized);
        @SuppressWarnings("unchecked")
        Map<String, Object> map = (Map<String, Object>) normalized;
        assertEquals("doc", map.get("source"));
        assertEquals(List.of("a", "b"), map.get("tags"));
    }

    @Test
    void normalize_sqlDateAndTime_withoutToInstant() {
        assertEquals("2024-03-15", JdbcCellValues.normalize(Date.valueOf("2024-03-15")));
        assertEquals("14:30", JdbcCellValues.normalize(Time.valueOf("14:30:00")));
        assertEquals(
                "2024-03-15T08:00:00Z",
                JdbcCellValues.normalize(Timestamp.from(java.time.Instant.parse("2024-03-15T08:00:00Z")))
        );
    }
}
