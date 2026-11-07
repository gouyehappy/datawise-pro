package org.apache.datawise.backend.elasticsearch;

import java.util.Locale;
import java.util.Set;

/** Mirrors dbx elasticsearchRequestRisk classification. */
public final class ElasticsearchRequestRisk {

    public enum Level {
        READ,
        WRITE,
        DANGEROUS
    }

    private static final Set<String> READ_ONLY_POST = Set.of(
            "_search", "_count", "_sql", "_msearch", "_field_caps", "_terms_enum",
            "_validate", "_explain", "_rank_eval", "_search_shards"
    );
    private static final Set<String> WRITE_POST = Set.of("_doc", "_create", "_update", "_bulk");

    private ElasticsearchRequestRisk() {
    }

    public static Level classify(String method, String path) {
        String m = method == null ? "" : method.trim().toUpperCase(Locale.ROOT);
        String[] segments = pathWithoutQuery(path).split("/");
        if ("GET".equals(m) || "HEAD".equals(m) || "OPTIONS".equals(m)) {
            return Level.READ;
        }
        if ("POST".equals(m)) {
            if (hasSegment(segments, READ_ONLY_POST)) {
                return Level.READ;
            }
            return hasSegment(segments, WRITE_POST) ? Level.WRITE : Level.DANGEROUS;
        }
        if ("PUT".equals(m) && (hasDocumentId(segments, "_doc") || hasDocumentId(segments, "_create"))) {
            return Level.WRITE;
        }
        if ("DELETE".equals(m) && hasDocumentId(segments, "_doc")) {
            return Level.WRITE;
        }
        return Level.DANGEROUS;
    }

    public static String toApiValue(Level level) {
        return level.name().toLowerCase(Locale.ROOT);
    }

    private static String pathWithoutQuery(String path) {
        if (path == null) {
            return "";
        }
        String trimmed = path.trim();
        int q = trimmed.indexOf('?');
        if (q >= 0) {
            trimmed = trimmed.substring(0, q);
        }
        while (trimmed.endsWith("/") && trimmed.length() > 1) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    private static boolean hasSegment(String[] segments, Set<String> candidates) {
        for (String segment : segments) {
            if (segment != null && candidates.contains(segment.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    private static boolean hasDocumentId(String[] segments, String marker) {
        for (int i = 0; i < segments.length; i++) {
            if (marker.equalsIgnoreCase(segments[i]) && i + 1 < segments.length && !segments[i + 1].isBlank()) {
                return true;
            }
        }
        return false;
    }
}
