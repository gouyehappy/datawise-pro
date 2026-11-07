package org.apache.datawise.backend.connector.mongodb.support;

import org.apache.datawise.backend.common.TableDataException;
import org.apache.datawise.backend.connector.document.DocumentCursorSupport;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MongoDocumentSupportTest {

    @Test
    void inferFieldsMarksIdAsFirstColumn() {
        List<MongoDocumentSupport.FieldInfo> fields = MongoDocumentSupport.inferFields(List.of(
                new Document("name", "Alice").append("_id", new ObjectId("507f1f77bcf86cd799439011"))
        ));
        assertEquals("_id", fields.get(0).name());
        assertEquals("string", fields.stream()
                .filter(field -> "name".equals(field.name()))
                .map(MongoDocumentSupport.FieldInfo::type)
                .findFirst()
                .orElseThrow());
    }

    @Test
    void inferTypeRecognizesNestedValues() {
        assertEquals("string", MongoDocumentSupport.inferType("text"));
        assertEquals("object", MongoDocumentSupport.inferType(new Document("x", 1)));
        assertEquals("array", MongoDocumentSupport.inferType(List.of(1, 2)));
        assertEquals("objectId", MongoDocumentSupport.inferType(new ObjectId()));
    }

    @Test
    void normalizeValueSerializesComplexBson() {
        ObjectId id = new ObjectId("507f1f77bcf86cd799439011");
        assertEquals("507f1f77bcf86cd799439011", MongoDocumentSupport.normalizeValue(id));
        String json = String.valueOf(MongoDocumentSupport.normalizeValue(new Document("a", 1)));
        assertTrue(json.contains("\"a\""));
        assertTrue(json.contains("1"));
    }

    @Test
    void toRowUsesStableColumnKeys() {
        ObjectId id = new ObjectId("507f1f77bcf86cd799439011");
        Document doc = new Document("_id", id).append("name", "Bob");
        List<MongoDocumentSupport.FieldInfo> fields = MongoDocumentSupport.inferFields(List.of(doc));
        Map<String, Object> row = MongoDocumentSupport.inferFields(List.of(doc)).stream()
                .collect(java.util.stream.Collectors.toMap(
                        MongoDocumentSupport.FieldInfo::key,
                        field -> MongoDocumentSupport.normalizeValue(doc.get(field.name()))
                ));

        assertEquals("507f1f77bcf86cd799439011", row.get("c1"));
        assertEquals("Bob", row.get(fields.stream().filter(f -> "name".equals(f.name())).findFirst().orElseThrow().key()));
    }

    @Test
    void documentCursorPrefixMatchesSharedConstant() {
        assertTrue(DocumentCursorSupport.isOffsetCursor(DocumentCursorSupport.OFFSET_PREFIX + "100"));
        assertEquals(100, DocumentCursorSupport.parseOffset(DocumentCursorSupport.OFFSET_PREFIX + "100"));
    }

    @Test
    void documentCursorRejectsDeepOffset() {
        String deep = DocumentCursorSupport.OFFSET_PREFIX + (DocumentCursorSupport.MAX_OFFSET + 1);
        TableDataException ex = assertThrows(
                TableDataException.class,
                () -> DocumentCursorSupport.parseOffset(deep)
        );
        assertEquals(DocumentCursorSupport.OFFSET_LIMIT_EXCEEDED, ex.getErrorCode());
    }

    @Test
    void parseFilterAcceptsBlankAndJsonObject() {
        assertTrue(MongoDocumentSupport.parseFilter(null).isEmpty());
        assertTrue(MongoDocumentSupport.parseFilter("  ").isEmpty());
        Document filter = MongoDocumentSupport.parseFilter("{\"status\":\"active\"}");
        assertEquals("active", filter.getString("status"));
    }

    @Test
    void parseFilterRejectsInvalidJson() {
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> MongoDocumentSupport.parseFilter("{status:")
        );
        assertTrue(ex.getMessage().contains("Invalid MongoDB filter JSON"));
    }
}
