package org.apache.datawise.backend.domain;

public record ExportTaskDto(
        String id,
        String name,
        String time,
        String status) {
}
