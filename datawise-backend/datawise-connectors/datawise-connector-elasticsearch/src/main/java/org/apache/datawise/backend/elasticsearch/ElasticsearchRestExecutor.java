package org.apache.datawise.backend.elasticsearch;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.domain.ElasticsearchRestResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Execute Kibana-console REST request(s) and shape the response. */
public final class ElasticsearchRestExecutor {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_ROWS = 2000;

    private ElasticsearchRestExecutor() {
    }

    public static ElasticsearchRestResultDto execute(ConnectionEntity entity, String requestText) throws Exception {
        long start = System.currentTimeMillis();
        List<ElasticsearchRestRequestParser.ParsedRequest> requests =
                ElasticsearchRestRequestParser.parseAll(requestText);
        if (requests.size() == 1) {
            return executeOne(entity, requests.get(0), start);
        }
        ArrayNode batch = MAPPER.createArrayNode();
        int lastStatus = 200;
        String lastError = null;
        ElasticsearchRequestRisk.Level worstRisk = ElasticsearchRequestRisk.Level.READ;
        for (ElasticsearchRestRequestParser.ParsedRequest parsed : requests) {
            ElasticsearchRestResultDto one = executeOne(entity, parsed, System.currentTimeMillis());
            ObjectNode item = MAPPER.createObjectNode();
            item.put("method", one.method());
            item.put("path", one.path());
            item.put("status", one.status());
            item.put("risk", one.risk());
            item.put("durationMs", one.durationMs());
            if (one.error() != null) {
                item.put("error", one.error());
                lastError = one.error();
            }
            try {
                item.set("body", MAPPER.readTree(one.rawBody() == null || one.rawBody().isBlank() ? "null" : one.rawBody()));
            } catch (Exception ignored) {
                item.put("body", one.rawBody());
            }
            batch.add(item);
            lastStatus = one.status();
            ElasticsearchRequestRisk.Level risk = ElasticsearchRequestRisk.classify(parsed.method(), parsed.path());
            if (risk.ordinal() > worstRisk.ordinal()) {
                worstRisk = risk;
            }
        }
        long duration = System.currentTimeMillis() - start;
        return new ElasticsearchRestResultDto(
                "BATCH",
                "/" + requests.size() + "-requests",
                lastStatus,
                ElasticsearchRequestRisk.toApiValue(worstRisk),
                MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(batch),
                false,
                List.of(),
                List.of(),
                duration,
                lastError
        );
    }

    private static ElasticsearchRestResultDto executeOne(
            ConnectionEntity entity,
            ElasticsearchRestRequestParser.ParsedRequest parsed,
            long start
    ) throws Exception {
        ElasticsearchRequestRisk.Level risk = ElasticsearchRequestRisk.classify(parsed.method(), parsed.path());
        String contentType = parsed.bodyKind() == ElasticsearchRestRequestParser.BodyKind.NDJSON
                ? "application/x-ndjson"
                : "application/json";
        ElasticsearchRestClient.RestResponse response = ElasticsearchConnectionSupport.client(entity)
                .request(parsed.method(), parsed.path(), parsed.body(), contentType);
        long duration = System.currentTimeMillis() - start;
        if (!response.isSuccessful()) {
            return new ElasticsearchRestResultDto(
                    parsed.method(),
                    parsed.path(),
                    response.status(),
                    ElasticsearchRequestRisk.toApiValue(risk),
                    response.body(),
                    false,
                    List.of(),
                    List.of(),
                    duration,
                    "HTTP " + response.status()
            );
        }
        TabularAttempt tabular = tryTabular(response.body());
        return new ElasticsearchRestResultDto(
                parsed.method(),
                parsed.path(),
                response.status(),
                ElasticsearchRequestRisk.toApiValue(risk),
                response.body(),
                tabular.tabular(),
                tabular.columns(),
                tabular.rows(),
                duration,
                null
        );
    }

    private static TabularAttempt tryTabular(String body) {
        if (body == null || body.isBlank()) {
            return TabularAttempt.empty();
        }
        try {
            JsonNode root = MAPPER.readTree(body);
            if (root.has("hits") && root.path("hits").has("hits")) {
                return fromSearchHits(root.path("hits").path("hits"));
            }
            if (root.isArray() && root.size() > 0 && root.get(0).isObject()) {
                return fromObjectArray(root);
            }
            if (root.has("columns") && root.has("rows")) {
                return fromSqlResponse(root);
            }
        } catch (Exception ignored) {
            return TabularAttempt.empty();
        }
        return TabularAttempt.empty();
    }

    private static TabularAttempt fromSearchHits(JsonNode hits) {
        List<Map<String, Object>> rows = new ArrayList<>();
        LinkedHashMap<String, Map<String, Object>> columns = new LinkedHashMap<>();
        ensureColumn(columns, "_id", "string");
        ensureColumn(columns, "_index", "string");
        ensureColumn(columns, "_score", "number");
        int count = 0;
        for (JsonNode hit : hits) {
            if (count >= MAX_ROWS) {
                break;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("_id", text(hit, "_id"));
            row.put("_index", text(hit, "_index"));
            row.put("_score", hit.path("_score").isNumber() ? hit.path("_score").numberValue() : null);
            JsonNode source = hit.path("_source");
            if (source.isObject()) {
                source.fields().forEachRemaining(entry -> {
                    ensureColumn(columns, entry.getKey(), inferType(entry.getValue()));
                    row.put(entry.getKey(), jsonValue(entry.getValue()));
                });
            }
            rows.add(row);
            count++;
        }
        return new TabularAttempt(true, new ArrayList<>(columns.values()), rows);
    }

    private static TabularAttempt fromObjectArray(JsonNode array) {
        List<Map<String, Object>> rows = new ArrayList<>();
        LinkedHashMap<String, Map<String, Object>> columns = new LinkedHashMap<>();
        int count = 0;
        for (JsonNode item : array) {
            if (count >= MAX_ROWS || !item.isObject()) {
                break;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            item.fields().forEachRemaining(entry -> {
                ensureColumn(columns, entry.getKey(), inferType(entry.getValue()));
                row.put(entry.getKey(), jsonValue(entry.getValue()));
            });
            rows.add(row);
            count++;
        }
        return new TabularAttempt(!rows.isEmpty(), new ArrayList<>(columns.values()), rows);
    }

    private static TabularAttempt fromSqlResponse(JsonNode root) {
        List<Map<String, Object>> columns = new ArrayList<>();
        for (JsonNode col : root.path("columns")) {
            String name = text(col, "name");
            if (name == null) {
                continue;
            }
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("name", name);
            meta.put("type", text(col, "type") != null ? text(col, "type") : "string");
            columns.add(meta);
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        int count = 0;
        for (JsonNode rowNode : root.path("rows")) {
            if (count >= MAX_ROWS) {
                break;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 0; i < columns.size(); i++) {
                String name = String.valueOf(columns.get(i).get("name"));
                JsonNode cell = rowNode.isArray() && i < rowNode.size() ? rowNode.get(i) : null;
                row.put(name, cell == null ? null : jsonValue(cell));
            }
            rows.add(row);
            count++;
        }
        return new TabularAttempt(!columns.isEmpty(), columns, rows);
    }

    private static void ensureColumn(LinkedHashMap<String, Map<String, Object>> columns, String name, String type) {
        columns.computeIfAbsent(name, key -> {
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("name", key);
            meta.put("type", type);
            return meta;
        });
    }

    private static String inferType(JsonNode value) {
        if (value == null || value.isNull()) {
            return "string";
        }
        if (value.isNumber()) {
            return "number";
        }
        if (value.isBoolean()) {
            return "boolean";
        }
        if (value.isObject() || value.isArray()) {
            return "json";
        }
        return "string";
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

    private record TabularAttempt(
            boolean tabular,
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows
    ) {
        static TabularAttempt empty() {
            return new TabularAttempt(false, List.of(), List.of());
        }
    }
}
