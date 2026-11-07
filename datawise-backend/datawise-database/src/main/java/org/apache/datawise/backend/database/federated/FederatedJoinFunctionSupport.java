package org.apache.datawise.backend.database.federated;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Residual WHERE function call parsing and evaluation for {@link FederatedJoinResidualFilter}.
 */
final class FederatedJoinFunctionSupport {

    private static final Set<String> SUPPORTED_FUNCTIONS = Set.of(
            "upper", "lower", "trim", "ltrim", "rtrim",
            "length", "char_length", "abs", "round", "ceil", "ceiling", "floor",
            "greatest", "least",
            "coalesce", "nullif", "concat", "substr", "substring"
    );

    private FederatedJoinFunctionSupport() {
    }

    static Object applyFunction(Map<String, Object> row, FunctionCall call) {
        List<String> args = call.arguments();
        return switch (call.name()) {
            case "upper" -> {
                requireArity(call, 1);
                yield mapString(FederatedJoinResidualFilter.resolve(row, args.get(0)), s -> s.toUpperCase(Locale.ROOT));
            }
            case "lower" -> {
                requireArity(call, 1);
                yield mapString(FederatedJoinResidualFilter.resolve(row, args.get(0)), s -> s.toLowerCase(Locale.ROOT));
            }
            case "trim" -> {
                requireArity(call, 1);
                yield mapString(FederatedJoinResidualFilter.resolve(row, args.get(0)), String::trim);
            }
            case "ltrim" -> {
                requireArity(call, 1);
                yield mapString(FederatedJoinResidualFilter.resolve(row, args.get(0)), FederatedJoinResidualFilter::ltrim);
            }
            case "rtrim" -> {
                requireArity(call, 1);
                yield mapString(FederatedJoinResidualFilter.resolve(row, args.get(0)), FederatedJoinResidualFilter::rtrim);
            }
            case "length", "char_length" -> {
                requireArity(call, 1);
                Object inner = FederatedJoinResidualFilter.resolve(row, args.get(0));
                yield inner == null ? null : (long) String.valueOf(inner).length();
            }
            case "abs" -> {
                requireArity(call, 1);
                yield absValue(FederatedJoinResidualFilter.resolve(row, args.get(0)));
            }
            case "round" -> {
                if (args.isEmpty() || args.size() > 2) {
                    throw new IllegalArgumentException("ROUND requires 1 or 2 arguments (expr[, scale])");
                }
                yield roundValue(
                        FederatedJoinResidualFilter.resolve(row, args.get(0)),
                        args.size() == 2 ? FederatedJoinResidualFilter.resolve(row, args.get(1)) : null
                );
            }
            case "ceil", "ceiling" -> {
                requireArity(call, 1);
                yield ceilValue(FederatedJoinResidualFilter.resolve(row, args.get(0)));
            }
            case "floor" -> {
                requireArity(call, 1);
                yield floorValue(FederatedJoinResidualFilter.resolve(row, args.get(0)));
            }
            case "greatest", "least" -> {
                if (args.size() < 2) {
                    throw new IllegalArgumentException(
                            call.name().toUpperCase(Locale.ROOT) + " requires at least 2 arguments"
                    );
                }
                List<Object> values = new ArrayList<>(args.size());
                for (String arg : args) {
                    values.add(FederatedJoinResidualFilter.resolve(row, arg));
                }
                yield extremumValue(values, "greatest".equals(call.name()));
            }
            case "coalesce" -> {
                if (args.size() < 2) {
                    throw new IllegalArgumentException("COALESCE requires at least 2 arguments");
                }
                Object found = null;
                for (String arg : args) {
                    Object value = FederatedJoinResidualFilter.resolve(row, arg);
                    if (value != null) {
                        found = value;
                        break;
                    }
                }
                yield found;
            }
            case "nullif" -> {
                requireArity(call, 2);
                Object left = FederatedJoinResidualFilter.resolve(row, args.get(0));
                Object right = FederatedJoinResidualFilter.resolve(row, args.get(1));
                yield FederatedJoinResidualFilter.eq(left, right) ? null : left;
            }
            case "concat" -> {
                if (args.isEmpty()) {
                    throw new IllegalArgumentException("CONCAT requires at least 1 argument");
                }
                StringBuilder out = new StringBuilder();
                for (String arg : args) {
                    out.append(nullToEmpty(FederatedJoinResidualFilter.resolve(row, arg)));
                }
                yield out.toString();
            }
            case "substr", "substring" -> {
                if (args.size() < 2 || args.size() > 3) {
                    throw new IllegalArgumentException(
                            "SUBSTR/SUBSTRING requires 2 or 3 arguments (expr, start[, length])"
                    );
                }
                yield substringValue(
                        FederatedJoinResidualFilter.resolve(row, args.get(0)),
                        FederatedJoinResidualFilter.resolve(row, args.get(1)),
                        args.size() == 3 ? FederatedJoinResidualFilter.resolve(row, args.get(2)) : null
                );
            }
            default -> throw new IllegalArgumentException(
                    "Unsupported federated residual function: " + call.name()
            );
        };
    }

    private static void requireArity(FunctionCall call, int expected) {
        if (call.arguments().size() != expected) {
            throw new IllegalArgumentException(
                    call.name().toUpperCase(Locale.ROOT) + " requires " + expected + " argument(s)"
            );
        }
    }

    private static Object mapString(Object inner, java.util.function.Function<String, String> mapper) {
        if (inner == null) {
            return null;
        }
        return mapper.apply(String.valueOf(inner));
    }

    private static Object absValue(Object value) {
        if (value == null) {
            return null;
        }
        if (!(value instanceof Number number)) {
            throw new IllegalArgumentException("ABS requires a numeric argument: " + value);
        }
        if (value instanceof Double || value instanceof Float) {
            return Math.abs(number.doubleValue());
        }
        return Math.abs(number.longValue());
    }

    /** SQL-style {@code ROUND(expr[, scale])}; scale defaults to 0 (nearest long). */
    static Object roundValue(Object value, Object scaleObj) {
        if (value == null) {
            return null;
        }
        double number = toDouble(value, "ROUND");
        int scale = scaleObj == null ? 0 : toInt(scaleObj, "ROUND scale");
        if (scale == 0) {
            return Math.round(number);
        }
        double factor = Math.pow(10, scale);
        return Math.round(number * factor) / factor;
    }

    static Object ceilValue(Object value) {
        if (value == null) {
            return null;
        }
        return (long) Math.ceil(toDouble(value, "CEIL"));
    }

    static Object floorValue(Object value) {
        if (value == null) {
            return null;
        }
        return (long) Math.floor(toDouble(value, "FLOOR"));
    }

    /**
     * MySQL-style extremum: ignore NULL arguments; return null when every argument is null.
     */
    static Object extremumValue(List<Object> values, boolean greatest) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        Object best = null;
        boolean found = false;
        for (Object value : values) {
            if (value == null) {
                continue;
            }
            if (!found) {
                best = value;
                found = true;
                continue;
            }
            int cmp = FederatedJoinResidualFilter.compareValues(value, best);
            if ((greatest && cmp > 0) || (!greatest && cmp < 0)) {
                best = value;
            }
        }
        return found ? best : null;
    }

    private static double toDouble(Object value, String label) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(value).trim());
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException(label + " requires a numeric argument: " + value, ex);
        }
    }

    private static String nullToEmpty(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    static Object concatValues(Object left, Object right) {
        return nullToEmpty(left) + nullToEmpty(right);
    }

    /** SQL-style 1-based {@code SUBSTR}; {@code start < 1} clamps to 1. */
    static Object substringValue(Object source, Object startObj, Object lengthObj) {
        if (source == null || startObj == null) {
            return null;
        }
        String text = String.valueOf(source);
        int start = toInt(startObj, "SUBSTR start");
        if (start < 1) {
            start = 1;
        }
        if (start > text.length()) {
            return "";
        }
        int from = start - 1;
        if (lengthObj == null) {
            return text.substring(from);
        }
        int length = toInt(lengthObj, "SUBSTR length");
        if (length <= 0) {
            return "";
        }
        int to = Math.min(text.length(), from + length);
        return text.substring(from, to);
    }

    private static int toInt(Object value, String label) {
        if (value instanceof Number number) {
            return numberToInt(number, label);
        }
        try {
            return numberToInt(Double.parseDouble(String.valueOf(value)), label);
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException(label + " must be numeric: " + value, ex);
        }
    }

    private static int numberToInt(Number number, String label) {
        if (number instanceof Double || number instanceof Float || number instanceof java.math.BigDecimal) {
            double d = number.doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) {
                throw new IllegalArgumentException(label + " must be a finite number: " + number);
            }
            return longToInt((long) d, label, number);
        }
        return longToInt(number.longValue(), label, number);
    }

    private static int longToInt(long value, String label, Object original) {
        if (value < Integer.MIN_VALUE || value > Integer.MAX_VALUE) {
            throw new IllegalArgumentException(label + " out of int range: " + original);
        }
        return (int) value;
    }

    /**
     * Parse a supported residual function call {@code NAME(arg[, …])} (parens must fully wrap
     * the argument list). Returns null when the token is not a function shape.
     * Unknown function names throw.
     */
    static FunctionCall parseFunctionCall(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        String trimmed = token.trim();
        int open = trimmed.indexOf('(');
        if (open <= 0 || !trimmed.endsWith(")")) {
            return null;
        }
        String name = trimmed.substring(0, open).trim().toLowerCase(Locale.ROOT);
        if (name.isEmpty() || !isIdentStart(name.charAt(0))) {
            return null;
        }
        for (int i = 1; i < name.length(); i++) {
            if (!FederatedJoinSqlTokens.isIdentChar(name.charAt(i))) {
                return null;
            }
        }
        String wrapped = trimmed.substring(open);
        if (!FederatedJoinSqlTokens.parensFullyWrap(wrapped)) {
            return null;
        }
        String body = wrapped.substring(1, wrapped.length() - 1).trim();
        List<String> args = splitFunctionArgs(body);
        if (!SUPPORTED_FUNCTIONS.contains(name)) {
            throw new IllegalArgumentException(
                    "Unsupported federated residual function: " + name
                            + " (supported: " + String.join(", ", SUPPORTED_FUNCTIONS.stream().sorted().toList()) + ")"
            );
        }
        if (args.isEmpty() && !"concat".equals(name)) {
            return null;
        }
        return new FunctionCall(name, args);
    }

    /** @deprecated use {@link #parseFunctionCall(String)}; kept for unary string call sites. */
    static FunctionCall parseUnaryStringFunction(String token) {
        FunctionCall call = parseFunctionCall(token);
        if (call == null || call.arguments().size() != 1) {
            return null;
        }
        String name = call.name();
        if (!"upper".equals(name)
                && !"lower".equals(name)
                && !"trim".equals(name)
                && !"ltrim".equals(name)
                && !"rtrim".equals(name)
                && !"length".equals(name)
                && !"char_length".equals(name)
                && !"abs".equals(name)) {
            return null;
        }
        return call;
    }

    static List<String> splitFunctionArgs(String body) {
        List<String> args = new ArrayList<>();
        if (body == null || body.isBlank()) {
            return args;
        }
        StringBuilder current = new StringBuilder();
        int depth = 0;
        boolean inSingle = false;
        boolean inDouble = false;
        for (int i = 0; i < body.length(); i++) {
            char ch = body.charAt(i);
            if (ch == '\'' && !inDouble) {
                inSingle = !inSingle;
                current.append(ch);
            } else if (ch == '"' && !inSingle) {
                inDouble = !inDouble;
                current.append(ch);
            } else if (!inSingle && !inDouble) {
                if (ch == '(') {
                    depth++;
                    current.append(ch);
                } else if (ch == ')') {
                    depth = Math.max(0, depth - 1);
                    current.append(ch);
                } else if (ch == ',' && depth == 0) {
                    String part = current.toString().trim();
                    if (!part.isEmpty()) {
                        args.add(part);
                    }
                    current = new StringBuilder();
                } else {
                    current.append(ch);
                }
            } else {
                current.append(ch);
            }
        }
        String last = current.toString().trim();
        if (!last.isEmpty()) {
            args.add(last);
        }
        return args;
    }

    private static boolean isIdentStart(char ch) {
        return Character.isLetter(ch) || ch == '_';
    }

    record FunctionCall(String name, List<String> arguments) {
        /** Convenience for single-arg unary calls. */
        String argument() {
            return arguments.isEmpty() ? "" : arguments.get(0);
        }
    }
}
