package org.apache.datawise.datagen.type;

import org.apache.datawise.datagen.type.base.IGenerator;

/**
 * JSON/JSONB 字段生成器：始终返回合法 JSON 文本，避免插入时发生 JSON 解析错误。
 */
public final class JsonStringGenerator implements IGenerator<String> {

    @Override
    public String generateData(String fieldName, GenContext ctx) {
        int seq = ctx.seq();
        String key = sanitizeJson(fieldName == null ? "field" : fieldName);
        return "{\"" + key + "\":\"value-" + seq + "\",\"seq\":" + seq + ",\"enabled\":" + (seq % 2 == 0) + "}";
    }

    private static String sanitizeJson(String raw) {
        return raw
                .replace("\\", "\\\\")
                .replace("\"", "\\\"");
    }
}
