package org.apache.datawise.backend.elasticsearch;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Parse Kibana-console style Elasticsearch REST requests (single or multi). */
public final class ElasticsearchRestRequestParser {

    private static final Set<String> METHODS = Set.of("GET", "POST", "PUT", "DELETE", "HEAD");
    private static final Set<String> NDJSON_SUFFIXES = Set.of("_bulk", "_msearch", "_mget");

    private ElasticsearchRestRequestParser() {
    }

    public static ParsedRequest parse(String input) {
        return parseAll(input).get(0);
    }

    public static List<ParsedRequest> parseAll(String input) {
        String stripped = stripLeadingComments(input);
        if (stripped.isBlank()) {
            throw new IllegalArgumentException("Invalid query: expected METHOD /path");
        }
        List<String> chunks = splitRequests(stripped);
        if (chunks.isEmpty()) {
            throw new IllegalArgumentException("Invalid query: expected METHOD /path");
        }
        List<ParsedRequest> parsed = new ArrayList<>(chunks.size());
        for (String chunk : chunks) {
            parsed.add(parseSingle(chunk));
        }
        return List.copyOf(parsed);
    }

    private static ParsedRequest parseSingle(String input) {
        String stripped = input == null ? "" : input.trim();
        if (stripped.isBlank()) {
            throw new IllegalArgumentException("Invalid query: expected METHOD /path");
        }
        String[] parts = stripped.split("\\R", 2);
        String requestLine = parts[0].trim();
        String body = parts.length > 1 ? parts[1].trim() : "";
        String[] methodPath = requestLine.split("\\s+", 2);
        if (methodPath.length < 2) {
            throw new IllegalArgumentException("Invalid query: expected METHOD /path");
        }
        String method = methodPath[0].trim().toUpperCase(Locale.ROOT);
        if (!METHODS.contains(method)) {
            throw new IllegalArgumentException(
                    "Unsupported HTTP method: " + method + ". Use GET, POST, PUT, DELETE, or HEAD."
            );
        }
        String path = methodPath[1].trim();
        if (path.isEmpty()) {
            throw new IllegalArgumentException("Invalid query: expected METHOD /path");
        }
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        path = maybeAppendCatJsonFormat(path);
        BodyKind bodyKind = isNdjsonPath(path) ? BodyKind.NDJSON : BodyKind.JSON;
        if (bodyKind == BodyKind.NDJSON && !body.isBlank()) {
            body = validateNdjson(body);
        }
        return new ParsedRequest(method, path, body.isBlank() ? null : body, bodyKind);
    }

    static List<String> splitRequests(String input) {
        String[] lines = input.split("\\R", -1);
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String line : lines) {
            String trimmed = line.trim();
            if (isRequestLine(trimmed) && current.length() > 0) {
                String chunk = current.toString().trim();
                if (!chunk.isBlank()) {
                    chunks.add(chunk);
                }
                current.setLength(0);
            }
            if (current.length() > 0) {
                current.append('\n');
            }
            current.append(line);
        }
        String last = current.toString().trim();
        if (!last.isBlank()) {
            chunks.add(last);
        }
        return chunks;
    }

    static boolean isRequestLine(String line) {
        if (line == null || line.isBlank()) {
            return false;
        }
        if (line.startsWith("#") || line.startsWith("//") || line.startsWith("/*")) {
            return false;
        }
        String[] parts = line.split("\\s+", 2);
        if (parts.length < 2) {
            return false;
        }
        String method = parts[0].trim().toUpperCase(Locale.ROOT);
        if (!METHODS.contains(method)) {
            return false;
        }
        String path = parts[1].trim();
        return !path.isEmpty() && (path.startsWith("/") || path.matches("[A-Za-z0-9_.*-].*"));
    }

    static String stripLeadingComments(String input) {
        if (input == null) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        boolean inBlock = false;
        boolean started = false;
        for (String rawLine : input.split("\\R", -1)) {
            String line = rawLine;
            if (!started) {
                String trimmed = line.trim();
                if (trimmed.isEmpty()) {
                    continue;
                }
                if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
                    continue;
                }
                if (trimmed.startsWith("/*")) {
                    inBlock = true;
                }
                if (inBlock) {
                    if (trimmed.contains("*/")) {
                        inBlock = false;
                    }
                    continue;
                }
                started = true;
            }
            if (out.length() > 0) {
                out.append('\n');
            }
            out.append(line);
        }
        return out.toString().trim();
    }

    static String maybeAppendCatJsonFormat(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("/_cat/") && !lower.contains("/_cat/")) {
            return path;
        }
        if (lower.contains("format=")) {
            return path;
        }
        return path.contains("?") ? path + "&format=json" : path + "?format=json";
    }

    static boolean isNdjsonPath(String path) {
        String withoutQuery = path.split("\\?", 2)[0];
        String[] segments = withoutQuery.split("/");
        for (String segment : segments) {
            if (NDJSON_SUFFIXES.contains(segment.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    static String validateNdjson(String body) {
        String[] lines = body.split("\\R");
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty()) {
                continue;
            }
            try {
                new com.fasterxml.jackson.databind.ObjectMapper().readTree(line);
            } catch (Exception ex) {
                throw new IllegalArgumentException("Invalid NDJSON body at line " + (i + 1) + ": " + ex.getMessage());
            }
        }
        String normalized = body.stripTrailing();
        return normalized + "\n";
    }

    public enum BodyKind {
        JSON,
        NDJSON
    }

    public record ParsedRequest(String method, String path, String body, BodyKind bodyKind) {
    }
}
