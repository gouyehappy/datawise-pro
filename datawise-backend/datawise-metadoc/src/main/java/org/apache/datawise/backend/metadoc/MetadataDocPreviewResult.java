package org.apache.datawise.backend.metadoc;

public record MetadataDocPreviewResult(
        String database,
        String connectionId,
        String format,
        String fileName,
        String markdown,
        String html
) {
}

