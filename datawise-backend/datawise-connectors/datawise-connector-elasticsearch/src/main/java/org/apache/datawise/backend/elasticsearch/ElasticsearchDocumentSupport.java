package org.apache.datawise.backend.elasticsearch;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.connector.document.DocumentCursorSupport;
import org.apache.datawise.backend.domain.ElasticsearchDocumentDto;
import org.apache.datawise.backend.domain.ElasticsearchDocumentMutationResultDto;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/** Document browse / CRUD via Elasticsearch REST `_search` and `_doc`. */
public final class ElasticsearchDocumentSupport {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_PAGE = 500;
    private static final int MAX_RESULT_WINDOW = 10_000;

    private ElasticsearchDocumentSupport() {
    }

    public static TableDataResult fetchDocumentPage(
            ConnectionEntity entity,
            String index,
            int offset,
            int limit,
            String filterJson
    ) throws Exception {
        if (offset < 0) {
            throw new IllegalArgumentException("offset must be >= 0");
        }
        if (limit <= 0) {
            throw new IllegalArgumentException("limit must be > 0");
        }
        DocumentCursorSupport.requireOffsetInRange(offset);
        int pageSize = Math.min(limit, MAX_PAGE);
        if (offset + pageSize > MAX_RESULT_WINDOW) {
            throw new IllegalArgumentException(
                    "Elasticsearch from+size cannot exceed " + MAX_RESULT_WINDOW
                            + "; use a filter or smaller offset"
            );
        }
        String safeIndex = ElasticsearchIndexSupport.requireIndex(index);
        ObjectNode body = buildSearchBody(filterJson, offset, pageSize);
        ElasticsearchRestClient.RestResponse response = ElasticsearchConnectionSupport.client(entity)
                .request(
                        "POST",
                        "/" + ElasticsearchIndexSupport.encodePathSegment(safeIndex) + "/_search",
                        MAPPER.writeValueAsString(body),
                        "application/json"
                );
        if (!response.isSuccessful()) {
            throw new IllegalStateException(
                    "Document search failed (" + response.status() + "): " + response.body()
            );
        }
        JsonNode root = MAPPER.readTree(response.body());
        JsonNode hits = root.path("hits").path("hits");
        List<JsonNode> docs = new ArrayList<>();
        if (hits.isArray()) {
            for (JsonNode hit : hits) {
                docs.add(hit);
            }
        }
        boolean hasMore = docs.size() >= pageSize;
        List<FieldInfo> fields = inferFields(docs);
        List<Map<String, Object>> columns = toColumnMaps(fields);
        List<Map<String, Object>> rows = new ArrayList<>(docs.size());
        for (JsonNode hit : docs) {
            rows.add(toRow(hit, fields));
        }
        String cursorId = hasMore ? DocumentCursorSupport.OFFSET_PREFIX + (offset + pageSize) : null;
        return new TableDataResult(columns, rows, cursorId, hasMore, offset, pageSize);
    }

    public static long countDocuments(ConnectionEntity entity, String index, String filterJson) throws Exception {
        String safeIndex = ElasticsearchIndexSupport.requireIndex(index);
        ObjectNode body = MAPPER.createObjectNode();
        body.set("query", buildQuery(filterJson));
        ElasticsearchRestClient.RestResponse response = ElasticsearchConnectionSupport.client(entity)
                .request(
                        "POST",
                        "/" + ElasticsearchIndexSupport.encodePathSegment(safeIndex) + "/_count",
                        MAPPER.writeValueAsString(body),
                        "application/json"
                );
        if (!response.isSuccessful()) {
            throw new IllegalStateException("Count failed (" + response.status() + "): " + response.body());
        }
        return MAPPER.readTree(response.body()).path("count").asLong(0L);
    }

    public static ElasticsearchDocumentMutationResultDto upsertDocument(
            ConnectionEntity entity,
            String index,
            String id,
            String sourceJson,
            String routing
    ) throws Exception {
        String safeIndex = ElasticsearchIndexSupport.requireIndex(index);
        if (sourceJson == null || sourceJson.isBlank()) {
            throw new IllegalArgumentException("sourceJson is required");
        }
        MAPPER.readTree(sourceJson);
        String path;
        String method;
        if (id == null || id.isBlank()) {
            method = "POST";
            path = "/" + ElasticsearchIndexSupport.encodePathSegment(safeIndex) + "/_doc";
        } else {
            method = "PUT";
            path = "/" + ElasticsearchIndexSupport.encodePathSegment(safeIndex)
                    + "/_doc/" + ElasticsearchIndexSupport.encodePathSegment(id.trim());
        }
        if (routing != null && !routing.isBlank()) {
            path += (path.contains("?") ? "&" : "?") + "routing=" + ElasticsearchIndexSupport.encodePathSegment(routing.trim());
        }
        path += (path.contains("?") ? "&" : "?") + "refresh=true";
        ElasticsearchRestClient.RestResponse response = ElasticsearchConnectionSupport.client(entity)
                .request(method, path, sourceJson, "application/json");
        if (!response.isSuccessful()) {
            throw new IllegalStateException("Upsert failed (" + response.status() + "): " + response.body());
        }
        JsonNode root = MAPPER.readTree(response.body());
        return new ElasticsearchDocumentMutationResultDto(
                text(root, "_id"),
                text(root, "_index") != null ? text(root, "_index") : safeIndex,
                text(root, "result"),
                response.status(),
                response.body()
        );
    }

    public static ElasticsearchDocumentMutationResultDto deleteDocument(
            ConnectionEntity entity,
            String index,
            String id,
            String routing
    ) throws Exception {
        String safeIndex = ElasticsearchIndexSupport.requireIndex(index);
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("id is required");
        }
        String path = "/" + ElasticsearchIndexSupport.encodePathSegment(safeIndex)
                + "/_doc/" + ElasticsearchIndexSupport.encodePathSegment(id.trim())
                + "?refresh=true";
        if (routing != null && !routing.isBlank()) {
            path += "&routing=" + ElasticsearchIndexSupport.encodePathSegment(routing.trim());
        }
        ElasticsearchRestClient.RestResponse response = ElasticsearchConnectionSupport.client(entity)
                .request("DELETE", path, null, null);
        if (!response.isSuccessful() && response.status() != 404) {
            throw new IllegalStateException("Delete failed (" + response.status() + "): " + response.body());
        }
        JsonNode root = response.body().isBlank() ? MAPPER.createObjectNode() : MAPPER.readTree(response.body());
        return new ElasticsearchDocumentMutationResultDto(
                id.trim(),
                safeIndex,
                text(root, "result") != null ? text(root, "result") : "deleted",
                response.status(),
                response.body()
        );
    }

    public static ElasticsearchDocumentDto getDocument(ConnectionEntity entity, String index, String id)
            throws Exception {
        String safeIndex = ElasticsearchIndexSupport.requireIndex(index);
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("id is required");
        }
        String path = "/" + ElasticsearchIndexSupport.encodePathSegment(safeIndex)
                + "/_doc/" + ElasticsearchIndexSupport.encodePathSegment(id.trim());
        ElasticsearchRestClient.RestResponse response = ElasticsearchConnectionSupport.client(entity).get(path);
        if (!response.isSuccessful()) {
            throw new IllegalStateException("Get document failed (" + response.status() + "): " + response.body());
        }
        JsonNode root = MAPPER.readTree(response.body());
        JsonNode source = root.path("_source");
        return new ElasticsearchDocumentDto(
                text(root, "_id"),
                text(root, "_index") != null ? text(root, "_index") : safeIndex,
                null,
                source.isMissingNode() || source.isNull() ? "{}" : source.toString()
        );
    }

    private static ObjectNode buildSearchBody(String filterJson, int from, int size) throws Exception {
        ObjectNode body = MAPPER.createObjectNode();
        body.put("from", from);
        body.put("size", size);
        body.set("query", buildQuery(filterJson));
        body.put("track_total_hits", true);
        return body;
    }

    private static JsonNode buildQuery(String filterJson) throws Exception {
        if (filterJson == null || filterJson.isBlank()) {
            return MAPPER.readTree("{\"match_all\":{}}");
        }
        JsonNode node = MAPPER.readTree(filterJson.trim());
        if (node.has("query")) {
            return node.get("query");
        }
        if (node.has("match_all") || node.has("bool") || node.has("term") || node.has("match")
                || node.has("range") || node.has("query_string")) {
            return node;
        }
        // Treat object as term filters on fields.
        ObjectNode bool = MAPPER.createObjectNode();
        ObjectNode mustContainer = MAPPER.createObjectNode();
        var must = mustContainer.putArray("filter");
        node.fields().forEachRemaining(entry -> {
            ObjectNode term = MAPPER.createObjectNode();
            ObjectNode inner = term.putObject("term");
            if (entry.getValue().isValueNode()) {
                if (entry.getValue().isNumber()) {
                    inner.set(entry.getKey(), entry.getValue());
                } else {
                    inner.put(entry.getKey(), entry.getValue().asText());
                }
            } else {
                inner.set(entry.getKey(), entry.getValue());
            }
            must.add(term);
        });
        bool.set("bool", mustContainer);
        return bool;
    }

    private record FieldInfo(String key, String name, String type) {
    }

    private static List<FieldInfo> inferFields(List<JsonNode> hits) {
        LinkedHashSet<String> names = new LinkedHashSet<>();
        names.add("_id");
        names.add("_score");
        Map<String, String> types = new LinkedHashMap<>();
        types.put("_id", "string");
        types.put("_score", "number");
        for (JsonNode hit : hits) {
            JsonNode source = hit.path("_source");
            if (!source.isObject()) {
                continue;
            }
            source.fields().forEachRemaining(entry -> {
                names.add(entry.getKey());
                types.putIfAbsent(entry.getKey(), inferType(entry.getValue()));
            });
        }
        List<FieldInfo> fields = new ArrayList<>(names.size());
        int index = 1;
        for (String name : names) {
            fields.add(new FieldInfo("c" + index++, name, types.getOrDefault(name, "string")));
        }
        return fields;
    }

    private static String inferType(JsonNode value) {
        if (value == null || value.isNull()) {
            return "null";
        }
        if (value.isNumber()) {
            return "number";
        }
        if (value.isBoolean()) {
            return "boolean";
        }
        if (value.isObject()) {
            return "object";
        }
        if (value.isArray()) {
            return "array";
        }
        return "string";
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

    private static Map<String, Object> toRow(JsonNode hit, List<FieldInfo> fields) {
        Map<String, Object> row = new LinkedHashMap<>();
        JsonNode source = hit.path("_source");
        for (FieldInfo field : fields) {
            if ("_id".equals(field.name())) {
                row.put(field.key(), text(hit, "_id"));
            } else if ("_score".equals(field.name())) {
                row.put(field.key(), hit.path("_score").isNumber() ? hit.path("_score").numberValue() : null);
            } else if (source.has(field.name())) {
                row.put(field.key(), jsonValue(source.get(field.name())));
            } else {
                row.put(field.key(), null);
            }
        }
        // Preserve raw source for document tab JSON editor.
        row.put("_sourceJson", source.isMissingNode() || source.isNull() ? "{}" : source.toString());
        return row;
    }

    private static Object jsonValue(JsonNode value) {
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isNumber()) {
            return value.numberValue();
        }
        if (value.isBoolean()) {
            return value.booleanValue();
        }
        if (value.isTextual()) {
            return value.asText();
        }
        return value.toString();
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String text = value.asText(null);
        return text == null || text.isBlank() ? null : text;
    }
}
