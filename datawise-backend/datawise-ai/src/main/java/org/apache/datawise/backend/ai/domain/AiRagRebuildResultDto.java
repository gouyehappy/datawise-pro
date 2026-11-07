package org.apache.datawise.backend.ai.domain;

public record AiRagRebuildResultDto(int syncedEntries, String message, String status) {

    public static AiRagRebuildResultDto of(String status, int syncedEntries, String message) {
        return new AiRagRebuildResultDto(syncedEntries, message, status);
    }
}