package org.apache.datawise.backend.metadoc;

public record MetadataDocExportResult(
        byte[] data,
        String contentType,
        String filename
) {
}

