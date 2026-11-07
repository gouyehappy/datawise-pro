package org.apache.datawise.backend.metadoc;

import java.util.Locale;

public enum MetadataDocFormat {
    MARKDOWN("text/markdown; charset=utf-8", "md"),
    HTML("text/html; charset=utf-8", "html");

    private final String contentType;
    private final String extension;

    MetadataDocFormat(String contentType, String extension) {
        this.contentType = contentType;
        this.extension = extension;
    }

    public String contentType() {
        return contentType;
    }

    public String extension() {
        return extension;
    }

    public static MetadataDocFormat parse(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "html" -> HTML;
            case "md", "markdown", "" -> MARKDOWN;
            default -> throw new IllegalArgumentException("Unsupported format: " + value);
        };
    }
}

