package org.apache.datawise.backend.common;

import java.util.Locale;

/** 标识符大小写策略（用于 quoteName 等）。 */
public enum FieldIdeEnum {

    ORIGINAL("original"),
    UPPERCASE("uppercase"),
    LOWERCASE("lowercase");

    private final String value;

    FieldIdeEnum(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static FieldIdeEnum parse(String value) {
        if (value == null || value.isBlank()) {
            return ORIGINAL;
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        for (FieldIdeEnum item : values()) {
            if (item.value.equals(normalized) || item.name().equalsIgnoreCase(value.trim())) {
                return item;
            }
        }
        return ORIGINAL;
    }
}
