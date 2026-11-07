package org.apache.datawise.backend.database.federated;

import java.util.Locale;
import java.util.Set;

/**
 * CAST parsing and evaluation for {@link FederatedJoinResidualFilter}.
 */
final class FederatedJoinCastSupport {

    private static final Set<String> CAST_STRING_TYPES = Set.of(
            "varchar", "char", "character", "text", "string", "nvarchar", "nchar"
    );
    private static final Set<String> CAST_INT_TYPES = Set.of(
            "int", "integer", "bigint", "smallint", "tinyint", "long"
    );
    private static final Set<String> CAST_FLOAT_TYPES = Set.of(
            "double", "float", "real", "decimal", "numeric", "number"
    );
    private static final Set<String> CAST_BOOL_TYPES = Set.of("boolean", "bool");

    private FederatedJoinCastSupport() {
    }

    /**
     * Parse {@code CAST(expr AS type)}. Type may include optional length {@code VARCHAR(64)}.
     * Returns null when the token is not a CAST form.
     */
    static CastCall parseCast(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        String trimmed = token.trim();
        if (trimmed.length() < 8 || !trimmed.regionMatches(true, 0, "cast", 0, 4)) {
            return null;
        }
        int i = 4;
        while (i < trimmed.length() && Character.isWhitespace(trimmed.charAt(i))) {
            i++;
        }
        if (i >= trimmed.length() || trimmed.charAt(i) != '(') {
            return null;
        }
        String wrapped = trimmed.substring(i);
        if (!FederatedJoinSqlTokens.parensFullyWrap(wrapped) || !trimmed.endsWith(")")) {
            return null;
        }
        String body = wrapped.substring(1, wrapped.length() - 1).trim();
        int asIdx = FederatedJoinSqlTokens.findKeyword(body, "as", 2);
        if (asIdx < 0) {
            return null;
        }
        String expression = body.substring(0, asIdx).trim();
        String targetType = body.substring(asIdx + 2).trim();
        if (expression.isEmpty() || targetType.isEmpty()) {
            return null;
        }
        int typeParen = targetType.indexOf('(');
        String baseType = (typeParen > 0 ? targetType.substring(0, typeParen) : targetType)
                .trim()
                .toLowerCase(Locale.ROOT);
        if (baseType.isEmpty()) {
            return null;
        }
        return new CastCall(expression, baseType);
    }

    static Object applyCast(Object value, String targetType) {
        if (value == null) {
            return null;
        }
        String type = targetType == null ? "" : targetType.toLowerCase(Locale.ROOT);
        if (CAST_STRING_TYPES.contains(type)) {
            return String.valueOf(value);
        }
        if (CAST_INT_TYPES.contains(type)) {
            if (value instanceof Number number) {
                return number.longValue();
            }
            try {
                return (long) Double.parseDouble(String.valueOf(value).trim());
            } catch (NumberFormatException ex) {
                throw new IllegalArgumentException("CAST to " + targetType + " failed: " + value, ex);
            }
        }
        if (CAST_FLOAT_TYPES.contains(type)) {
            if (value instanceof Number number) {
                return number.doubleValue();
            }
            try {
                return Double.parseDouble(String.valueOf(value).trim());
            } catch (NumberFormatException ex) {
                throw new IllegalArgumentException("CAST to " + targetType + " failed: " + value, ex);
            }
        }
        if (CAST_BOOL_TYPES.contains(type)) {
            if (value instanceof Boolean bool) {
                return bool;
            }
            String text = String.valueOf(value).trim();
            if ("1".equals(text) || "true".equalsIgnoreCase(text) || "t".equalsIgnoreCase(text) || "yes".equalsIgnoreCase(text)) {
                return true;
            }
            if ("0".equals(text) || "false".equalsIgnoreCase(text) || "f".equalsIgnoreCase(text) || "no".equalsIgnoreCase(text)) {
                return false;
            }
            throw new IllegalArgumentException("CAST to BOOLEAN failed: " + value);
        }
        throw new IllegalArgumentException(
                "Unsupported CAST target type: " + targetType
                        + " (supported: VARCHAR/CHAR/TEXT, INT/BIGINT, DOUBLE/DECIMAL/NUMERIC, BOOLEAN)"
        );
    }

    record CastCall(String expression, String targetType) {
    }
}
