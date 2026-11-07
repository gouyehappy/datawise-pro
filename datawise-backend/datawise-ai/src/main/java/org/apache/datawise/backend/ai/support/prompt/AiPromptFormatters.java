package org.apache.datawise.backend.ai.support.prompt;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 查询结果列/行格式化，供 LLM user prompt 复用。
 */
public final class AiPromptFormatters {

    private AiPromptFormatters() {
    }

    public static String formatColumns(List<Map<String, Object>> columns) {
        if (columns == null || columns.isEmpty()) {
            return "(none)";
        }
        List<String> names = new ArrayList<>();
        for (Map<String, Object> column : columns) {
            Object name = column.get("name");
            if (name != null) {
                names.add(String.valueOf(name));
            }
        }
        return String.join(", ", names);
    }

    public static String formatRows(
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            int limit
    ) {
        if (rows == null || rows.isEmpty()) {
            return "(empty)";
        }
        List<String> keys = new ArrayList<>();
        if (columns != null) {
            for (Map<String, Object> column : columns) {
                Object key = column.get("key");
                if (key == null) {
                    key = column.get("name");
                }
                if (key != null) {
                    keys.add(String.valueOf(key));
                }
            }
        }
        List<String> lines = new ArrayList<>();
        int count = Math.min(limit, rows.size());
        for (int i = 0; i < count; i++) {
            Map<String, Object> row = rows.get(i);
            Map<String, Object> compact = new LinkedHashMap<>();
            if (!keys.isEmpty()) {
                for (String key : keys) {
                    compact.put(key, row.get(key));
                }
            } else {
                compact.putAll(row);
            }
            lines.add(compact.toString());
        }
        return String.join("\n", lines);
    }
}
