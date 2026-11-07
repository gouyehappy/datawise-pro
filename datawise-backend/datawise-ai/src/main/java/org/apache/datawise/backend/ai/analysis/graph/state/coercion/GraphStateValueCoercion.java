package org.apache.datawise.backend.ai.analysis.graph.state.coercion;

import java.util.List;
import java.util.Map;

/**
 * checkpoint Gson 往返后的 Map 值读取工具
 */
public final class GraphStateValueCoercion {

    private GraphStateValueCoercion() {
    }

    public static String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    public static Boolean boolValue(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        return null;
    }

    public static int intValue(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        return 0;
    }

    public static long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        return 0L;
    }

    public static Double doubleObject(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        return null;
    }

    public static double doubleValue(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        return 0D;
    }

    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> castListOfMaps(Object raw) {
        if (raw instanceof List<?> list) {
            return (List<Map<String, Object>>) list;
        }
        return List.of();
    }

    @SuppressWarnings("unchecked")
    public static List<String> castStringList(Object raw) {
        if (raw instanceof List<?> list) {
            return (List<String>) list;
        }
        return List.of();
    }
}
