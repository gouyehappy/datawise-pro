package org.apache.datawise.backend.dml;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** 列名白名单过滤，与方言无关。 */
public final class DmlColumnFilter {

    private DmlColumnFilter() {
    }

    /** 仅保留 allowedColumnNames 中存在的列（大小写不敏感匹配）。 */
    public static Map<String, Object> filterKnownColumns(
                                                         Map<String, Object> values,
                                                         List<String> allowedColumnNames) {
        Map<String, String> allowed = new LinkedHashMap<>();
        for (String name : allowedColumnNames) {
            if (name != null && !name.isBlank()) {
                allowed.put(name.toLowerCase(Locale.ROOT), name);
            }
        }
        Map<String, Object> filtered = new LinkedHashMap<>();
        if (values == null) {
            return filtered;
        }
        for (Map.Entry<String, Object> entry : values.entrySet()) {
            if (entry.getKey() == null) {
                continue;
            }
            String canonical = allowed.get(entry.getKey().toLowerCase(Locale.ROOT));
            if (canonical != null) {
                filtered.put(canonical, entry.getValue());
            }
        }
        return filtered;
    }
}
