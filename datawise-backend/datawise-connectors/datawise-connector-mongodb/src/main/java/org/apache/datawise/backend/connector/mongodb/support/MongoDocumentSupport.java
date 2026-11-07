package org.apache.datawise.backend.connector.mongodb.support;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoCursor;
import org.apache.datawise.backend.connector.document.DocumentCursorSupport;
import org.apache.datawise.backend.common.TableDataException;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.bson.Document;
import org.bson.types.ObjectId;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/** Reads MongoDB collection documents and maps them to table-data grid rows. */
public final class MongoDocumentSupport {

    private static final int FIELD_SAMPLE_LIMIT = 100;

    private MongoDocumentSupport() {
    }

    public static TableDataResult fetchCollectionPage(
            ConnectionEntity entity,
            String database,
            String collection,
            int offset,
            int limit
    ) {
        return fetchCollectionPage(entity, database, collection, offset, limit, null);
    }

    public static TableDataResult fetchCollectionPage(
            ConnectionEntity entity,
            String database,
            String collection,
            int offset,
            int limit,
            String filterJson
    ) {
        if (offset < 0) {
            throw new IllegalArgumentException("offset must be >= 0");
        }
        if (limit <= 0) {
            throw new IllegalArgumentException("limit must be > 0");
        }
        DocumentCursorSupport.requireOffsetInRange(offset);
        Document filter;
        try {
            filter = parseFilter(filterJson);
        } catch (IllegalArgumentException ex) {
            throw new TableDataException(
                    ex.getMessage(),
                    TableDataException.FETCH_FAILED,
                    ex
            );
        }
        try {
            return MongoClientSupport.withCollection(entity, database, collection, coll -> {
                List<Document> docs = new ArrayList<>(limit + 1);
                try (MongoCursor<Document> cursor = coll.find(filter).skip(offset).limit(limit + 1).iterator()) {
                    while (cursor.hasNext()) {
                        docs.add(cursor.next());
                    }
                }
                boolean hasMore = docs.size() > limit;
                if (hasMore) {
                    docs = docs.subList(0, limit);
                }
                List<FieldInfo> fields = inferFields(docs);
                List<Map<String, Object>> columns = toColumnMaps(fields);
                List<Map<String, Object>> rows = new ArrayList<>(docs.size());
                for (Document doc : docs) {
                    rows.add(toRow(doc, fields));
                }
                String cursorId = hasMore ? DocumentCursorSupport.OFFSET_PREFIX + (offset + limit) : null;
                return new TableDataResult(columns, rows, cursorId, hasMore, offset, limit);
            });
        } catch (TableDataException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new TableDataException(
                    MongoConnectionErrors.toUserMessage(entity, ex),
                    TableDataException.FETCH_FAILED,
                    ex
            );
        }
    }

    /** Blank filter matches all documents; invalid JSON throws {@link IllegalArgumentException}. */
    static Document parseFilter(String filterJson) {
        if (filterJson == null || filterJson.isBlank()) {
            return new Document();
        }
        try {
            return Document.parse(filterJson.trim());
        } catch (RuntimeException ex) {
            throw new IllegalArgumentException("Invalid MongoDB filter JSON: " + ex.getMessage(), ex);
        }
    }

    public static List<TreeNode> loadCollectionFieldNodes(
            ConnectionEntity entity,
            String connectionId,
            String database,
            String collection
    ) {
        try {
            List<FieldInfo> fields = sampleCollectionFields(entity, database, collection);
            return toFieldNodes(fields, connectionId, database, collection);
        } catch (Exception ex) {
            throw new TableDataException(
                    MongoConnectionErrors.toUserMessage(entity, ex),
                    TableDataException.FETCH_FAILED,
                    ex
            );
        }
    }

    public static TablePropertiesResult loadCollectionProperties(
            ConnectionEntity entity,
            String database,
            String collection
    ) {
        try {
            List<FieldInfo> fields = sampleCollectionFields(entity, database, collection);
            return toPropertiesResult(collection, fields);
        } catch (Exception ex) {
            throw new TableDataException(
                    MongoConnectionErrors.toUserMessage(entity, ex),
                    TableDataException.FETCH_FAILED,
                    ex
            );
        }
    }

    public record FieldInfo(String key, String name, String type) {
    }

    static List<FieldInfo> inferFields(List<Document> docs) {
        LinkedHashSet<String> names = new LinkedHashSet<>();
        names.add("_id");
        Map<String, String> typeHints = new LinkedHashMap<>();
        for (Document doc : docs) {
            for (Map.Entry<String, Object> entry : doc.entrySet()) {
                String name = entry.getKey();
                if (name == null || name.isBlank()) {
                    continue;
                }
                names.add(name);
                typeHints.putIfAbsent(name, inferType(entry.getValue()));
            }
        }
        List<FieldInfo> fields = new ArrayList<>(names.size());
        int index = 1;
        for (String name : names) {
            fields.add(new FieldInfo("c" + index++, name, typeHints.getOrDefault(name, "unknown")));
        }
        return fields;
    }

    static String inferType(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof String) {
            return "string";
        }
        if (value instanceof Boolean) {
            return "boolean";
        }
        if (value instanceof Integer || value instanceof Long) {
            return "integer";
        }
        if (value instanceof Double || value instanceof Float) {
            return "double";
        }
        if (value instanceof ObjectId) {
            return "objectId";
        }
        if (value instanceof Document) {
            return "object";
        }
        if (value instanceof List<?>) {
            return "array";
        }
        return value.getClass().getSimpleName();
    }

    static Object normalizeValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof ObjectId objectId) {
            return objectId.toHexString();
        }
        if (value instanceof Document document) {
            return document.toJson();
        }
        if (value instanceof List<?> list) {
            return list.toString();
        }
        return value;
    }

    private static List<FieldInfo> sampleCollectionFields(
            ConnectionEntity entity,
            String database,
            String collection
    ) {
        return MongoClientSupport.withCollection(entity, database, collection, coll -> {
            List<Document> sample = new ArrayList<>(FIELD_SAMPLE_LIMIT);
            try (MongoCursor<Document> cursor = coll.find().limit(FIELD_SAMPLE_LIMIT).iterator()) {
                while (cursor.hasNext()) {
                    sample.add(cursor.next());
                }
            }
            return inferFields(sample);
        });
    }

    private static List<TreeNode> toFieldNodes(
            List<FieldInfo> fields,
            String connectionId,
            String database,
            String collection
    ) {
        List<TreeNode> nodes = new ArrayList<>(fields.size());
        for (FieldInfo field : fields) {
            TreeNode column = new TreeNode();
            column.setId(SchemaNodeIds.nodeId("col", connectionId, database, collection, field.name()));
            column.setLabel(field.name());
            column.setType("_id".equals(field.name()) ? "primary_key" : "column");
            if (field.type() != null && !field.type().isBlank()) {
                column.setMeta(field.type().toLowerCase());
            }
            nodes.add(column);
        }
        return nodes;
    }

    private static TablePropertiesResult toPropertiesResult(String collection, List<FieldInfo> fields) {
        List<TableColumnDetail> columns = new ArrayList<>(fields.size());
        int ordinal = 1;
        for (FieldInfo field : fields) {
            boolean isPrimaryKey = "_id".equals(field.name());
            columns.add(new TableColumnDetail(
                    ordinal++,
                    field.name(),
                    field.type(),
                    true,
                    false,
                    isPrimaryKey ? "PRI" : null,
                    null,
                    null,
                    null
            ));
        }
        return new TablePropertiesResult(
                collection,
                null,
                null,
                null,
                null,
                null,
                columns,
                List.of(),
                List.of()
        );
    }

    private static List<Map<String, Object>> toColumnMaps(List<FieldInfo> fields) {
        List<Map<String, Object>> columns = new ArrayList<>(fields.size());
        for (FieldInfo field : fields) {
            Map<String, Object> column = new LinkedHashMap<>();
            column.put("key", field.key());
            column.put("name", field.name());
            column.put("type", field.type());
            columns.add(column);
        }
        return columns;
    }

    private static Map<String, Object> toRow(Document doc, List<FieldInfo> fields) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (FieldInfo field : fields) {
            row.put(field.key(), normalizeValue(doc.get(field.name())));
        }
        return row;
    }
}
