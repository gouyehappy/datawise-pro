package org.apache.datawise.sqlparser.support;

import java.util.Collection;
import java.util.Map;

/** Minimal collection helpers (replaces hutool CollUtil in components sqlparser). */
public final class CollUtil {

    private CollUtil() {
    }

    public static boolean isEmpty(Collection<?> collection) {
        return collection == null || collection.isEmpty();
    }

    public static boolean isNotEmpty(Collection<?> collection) {
        return !isEmpty(collection);
    }

    public static boolean isEmpty(Map<?, ?> map) {
        return map == null || map.isEmpty();
    }

    public static boolean isNotEmpty(Map<?, ?> map) {
        return !isEmpty(map);
    }
}
