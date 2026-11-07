package org.apache.datawise.backend.elasticsearch;

import com.fasterxml.jackson.databind.JsonNode;
import org.apache.datawise.backend.domain.ElasticsearchClearIndexResultDto;
import org.apache.datawise.backend.domain.ElasticsearchIndexEntryDto;
import org.apache.datawise.backend.domain.ElasticsearchIndexMetadataDto;
import org.apache.datawise.backend.domain.ElasticsearchIndicesResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Index discovery and metadata via Elasticsearch REST. */
public final class ElasticsearchIndexSupport {

    private ElasticsearchIndexSupport() {
    }

    public static ElasticsearchIndicesResultDto listIndices(ConnectionEntity entity) throws Exception {
        ElasticsearchRestClient client = ElasticsearchConnectionSupport.client(entity);
        ElasticsearchRestClient.RestResponse response = client.get("/_cat/indices?format=json&h=index");
        ElasticsearchIndicesResultDto base;
        if (response.isSuccessful()) {
            base = new ElasticsearchIndicesResultDto(parseCatIndices(response.body()));
        } else if (response.status() == 401 || response.status() == 403) {
            base = listIndicesViaMetadata(client);
        } else {
            throw new IllegalStateException(
                    "Elasticsearch list indices failed (" + response.status() + "): " + response.body()
            );
        }
        return withAliases(client, base);
    }

    public static ElasticsearchIndexMetadataDto getIndexMetadata(ConnectionEntity entity, String index) throws Exception {
        return getIndexMetadata(entity, index, "all");
    }

    public static ElasticsearchIndexMetadataDto getIndexMetadata(ConnectionEntity entity, String index, String kind)
            throws Exception {
        String safe = requireIndex(index);
        ElasticsearchRestClient client = ElasticsearchConnectionSupport.client(entity);
        String encoded = encodePathSegment(safe);
        String normalized = kind == null || kind.isBlank() ? "all" : kind.trim().toLowerCase(Locale.ROOT);
        String mapping = null;
        String settings = null;
        String stats = null;
        if ("all".equals(normalized) || "mapping".equals(normalized)) {
            mapping = requireOk(client.get("/" + encoded + "/_mapping")).body();
        }
        if ("all".equals(normalized) || "settings".equals(normalized)) {
            settings = requireOk(client.get("/" + encoded + "/_settings")).body();
        }
        if ("all".equals(normalized) || "stats".equals(normalized)) {
            stats = requireOk(client.get("/" + encoded + "/_stats")).body();
        }
        return new ElasticsearchIndexMetadataDto(safe, mapping, settings, stats);
    }

    public static ElasticsearchClearIndexResultDto clearIndex(ConnectionEntity entity, String index) throws Exception {
        String safe = requireIndex(index);
        ElasticsearchRestClient client = ElasticsearchConnectionSupport.client(entity);
        String path = "/" + encodePathSegment(safe) + "/_delete_by_query?conflicts=proceed&refresh=true";
        String body = "{\"query\":{\"match_all\":{}}}";
        ElasticsearchRestClient.RestResponse response = client.request("POST", path, body, "application/json");
        if (!response.isSuccessful()) {
            throw new IllegalStateException(
                    "Clear index failed (" + response.status() + "): " + response.body()
            );
        }
        long deleted = 0L;
        long total = 0L;
        long versionConflicts = 0L;
        boolean timedOut = false;
        List<String> failures = new ArrayList<>();
        try {
            JsonNode node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(response.body());
            deleted = node.path("deleted").asLong(0L);
            total = node.path("total").asLong(deleted);
            versionConflicts = node.path("version_conflicts").asLong(0L);
            timedOut = node.path("timed_out").asBoolean(false);
            JsonNode failureNodes = node.path("failures");
            if (failureNodes.isArray()) {
                for (JsonNode failure : failureNodes) {
                    failures.add(failure.toString());
                }
            }
        } catch (Exception ignored) {
            // keep defaults
        }
        return new ElasticsearchClearIndexResultDto(
                safe, deleted, total, versionConflicts, timedOut, List.copyOf(failures), response.body()
        );
    }

    private static ElasticsearchRestClient.RestResponse requireOk(ElasticsearchRestClient.RestResponse response) {
        if (!response.isSuccessful()) {
            throw new IllegalStateException(
                    "Elasticsearch metadata request failed (" + response.status() + "): " + response.body()
            );
        }
        return response;
    }

    private static ElasticsearchIndicesResultDto listIndicesViaMetadata(ElasticsearchRestClient client) throws Exception {
        ElasticsearchRestClient.RestResponse resolve = client.get("/_resolve/index/*");
        if (resolve.isSuccessful()) {
            return new ElasticsearchIndicesResultDto(parseResolveIndices(resolve.body()));
        }
        if (resolve.status() != 401 && resolve.status() != 403) {
            throw new IllegalStateException(
                    "Elasticsearch resolve index failed (" + resolve.status() + "): " + resolve.body()
            );
        }
        ElasticsearchRestClient.RestResponse aliases = client.get("/_alias");
        if (!aliases.isSuccessful()) {
            throw new IllegalStateException(
                    "Elasticsearch alias listing failed (" + aliases.status() + "): " + aliases.body()
            );
        }
        return new ElasticsearchIndicesResultDto(parseAliasIndices(aliases.body()));
    }

    private static ElasticsearchIndicesResultDto withAliases(
            ElasticsearchRestClient client,
            ElasticsearchIndicesResultDto base
    ) {
        try {
            ElasticsearchRestClient.RestResponse aliases = client.get("/_alias");
            if (!aliases.isSuccessful()) {
                return base;
            }
            Map<String, List<String>> aliasByIndex = parseAliasMap(aliases.body());
            List<ElasticsearchIndexEntryDto> entries = new ArrayList<>(base.indices().size());
            for (ElasticsearchIndexEntryDto entry : base.indices()) {
                entries.add(new ElasticsearchIndexEntryDto(
                        entry.name(),
                        aliasByIndex.getOrDefault(entry.name(), List.of())
                ));
            }
            return new ElasticsearchIndicesResultDto(entries);
        } catch (Exception ignored) {
            return base;
        }
    }

    private static Map<String, List<String>> parseAliasMap(String body) throws Exception {
        JsonNode root = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
        Map<String, List<String>> aliasByIndex = new LinkedHashMap<>();
        root.fields().forEachRemaining(indexEntry -> {
            String indexName = indexEntry.getKey();
            if (!isUserIndex(indexName)) {
                return;
            }
            JsonNode aliases = indexEntry.getValue().path("aliases");
            if (!aliases.isObject()) {
                aliasByIndex.put(indexName, List.of());
                return;
            }
            List<String> names = new ArrayList<>();
            aliases.fieldNames().forEachRemaining(names::add);
            names.sort(String::compareToIgnoreCase);
            aliasByIndex.put(indexName, List.copyOf(names));
        });
        return aliasByIndex;
    }

    private static List<ElasticsearchIndexEntryDto> parseCatIndices(String body) throws Exception {
        JsonNode root = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
        Set<String> names = new LinkedHashSet<>();
        if (root.isArray()) {
            for (JsonNode item : root) {
                String name = text(item, "index");
                if (isUserIndex(name)) {
                    names.add(name);
                }
            }
        }
        List<ElasticsearchIndexEntryDto> entries = new ArrayList<>();
        for (String name : names) {
            entries.add(new ElasticsearchIndexEntryDto(name, List.of()));
        }
        return entries;
    }

    private static List<ElasticsearchIndexEntryDto> parseResolveIndices(String body) throws Exception {
        JsonNode root = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
        Set<String> names = new LinkedHashSet<>();
        for (String field : List.of("indices", "aliases", "data_streams")) {
            JsonNode arr = root.path(field);
            if (!arr.isArray()) {
                continue;
            }
            for (JsonNode item : arr) {
                String name = text(item, "name");
                if (isUserIndex(name)) {
                    names.add(name);
                }
            }
        }
        List<ElasticsearchIndexEntryDto> entries = new ArrayList<>();
        for (String name : names) {
            entries.add(new ElasticsearchIndexEntryDto(name, List.of()));
        }
        return entries;
    }

    private static List<ElasticsearchIndexEntryDto> parseAliasIndices(String body) throws Exception {
        JsonNode root = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
        Set<String> names = new LinkedHashSet<>();
        root.fieldNames().forEachRemaining(name -> {
            if (isUserIndex(name)) {
                names.add(name);
            }
        });
        List<ElasticsearchIndexEntryDto> entries = new ArrayList<>();
        for (String name : names) {
            entries.add(new ElasticsearchIndexEntryDto(name, List.of()));
        }
        return entries;
    }

    static boolean isUserIndex(String name) {
        return name != null && !name.isBlank() && !name.startsWith(".");
    }

    static String requireIndex(String index) {
        if (index == null || index.isBlank()) {
            throw new IllegalArgumentException("index is required");
        }
        String trimmed = index.trim();
        if (trimmed.contains("/") || trimmed.contains("?") || trimmed.contains("#")) {
            throw new IllegalArgumentException("invalid index name");
        }
        return trimmed;
    }

    static String encodePathSegment(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String text = value.asText(null);
        return text == null || text.isBlank() ? null : text.trim();
    }
}
