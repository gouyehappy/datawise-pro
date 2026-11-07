package org.apache.datawise.backend.common;

import java.util.Locale;

/**
 * Dialect-aware SQL identifier quoting and field-case normalization.
 * Extracted from {@link DbType} so quote rules can evolve without growing the enum further.
 */
public final class IdentifierQuoting {

    private IdentifierQuoting() {
    }

    public static String applyFieldIde(String identifier, FieldIdeEnum fieldIde) {
        if (identifier == null || fieldIde == null) {
            return identifier;
        }
        if (fieldIde == FieldIdeEnum.LOWERCASE) {
            return identifier.toLowerCase(Locale.ROOT);
        }
        if (fieldIde == FieldIdeEnum.UPPERCASE) {
            return identifier.toUpperCase(Locale.ROOT);
        }
        return identifier;
    }

    /**
     * Quote a single identifier with the dialect quote character, after applying field IDE casing.
     */
    public static String quote(String name, String quote, FieldIdeEnum fieldIde) {
        if (name == null || name.isBlank()) {
            return name;
        }
        if ("*".equals(name)) {
            return name;
        }
        String body = applyFieldIde(name, fieldIde);
        if (quote == null || quote.isEmpty()) {
            return body;
        }
        if ("`".equals(quote)) {
            return "`" + body.replace("`", "``") + "`";
        }
        if ("\"".equals(quote)) {
            return "\"" + body.replace("\"", "\"\"") + "\"";
        }
        if ("[".equals(quote)) {
            return "[" + body.replace("]", "]]") + "]";
        }
        return quote + body + quote;
    }
}
