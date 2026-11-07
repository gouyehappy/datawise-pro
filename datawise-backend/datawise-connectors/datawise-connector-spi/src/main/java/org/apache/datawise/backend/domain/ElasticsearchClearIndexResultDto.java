package org.apache.datawise.backend.domain;

public record ElasticsearchClearIndexResultDto(
        String index,
        long deleted,
        long total,
        long versionConflicts,
        boolean timedOut,
        java.util.List<String> failures,
        String rawBody) {

    public ElasticsearchClearIndexResultDto(String index, long deleted, boolean timedOut, String rawBody) {
        this(index, deleted, deleted, 0L, timedOut, java.util.List.of(), rawBody);
    }
}
