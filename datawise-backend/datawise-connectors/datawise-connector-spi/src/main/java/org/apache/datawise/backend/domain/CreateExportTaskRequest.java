package org.apache.datawise.backend.domain;

public record CreateExportTaskRequest(
        String fileName,
        Boolean clientCompleted,
        Long fileSize) {
}
