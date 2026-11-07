package org.apache.datawise.datagen.type;

import java.util.List;

/**
 * 字符串字段生成器（同时覆盖部分“语义字段名”规则，例如 email/phone/status 等）。
 */
public final class StringGenerator implements org.apache.datawise.datagen.type.base.IGenerator<String> {

    private final Integer charCount;
    private final List<String> cities;

    public StringGenerator(Integer charCount) {
        this.charCount = charCount;
        this.cities = List.of("Shanghai", "Beijing", "Shenzhen", "Hangzhou");
    }

    @Override
    public String generateData(String fieldName, GenContext ctx) {
        String name = fieldName == null ? "" : fieldName.toLowerCase();
        int seq = ctx.seq();

        if (name.contains("email")) {
            return "user" + seq + "@example.com";
        }
        if (name.contains("phone") || name.contains("mobile")) {
            return "138000" + String.format("%05d", (10000 + seq) % 100000);
        }
        if (name.contains("password") || name.contains("passwd")) {
            return "Passw0rd!" + seq;
        }
        if (name.contains("status")) {
            return seq % 3 == 0 ? "inactive" : "active";
        }
        if (name.contains("code") || name.endsWith("_no") || name.endsWith("_num")) {
            return "CODE-" + (1000 + seq);
        }
        if (name.contains("sku")) {
            return "SKU-" + (10000 + seq);
        }
        if (name.contains("ip")) {
            return "192.168." + ((seq % 250) + 1) + "." + ((seq % 200) + 10);
        }
        if (name.contains("address") || name.contains("street")) {
            // 使用 faker 生成更像真实地址
            return ctx.faker().address().streetAddress();
        }
        if (name.contains("city")) {
            return cities.get((seq - 1) % cities.size());
        }
        if (name.contains("country")) {
            return seq % 2 == 0 ? "CN" : "US";
        }
        if (name.contains("title") && !name.contains("job")) {
            return "Sample title " + seq;
        }
        if (name.contains("description") || name.contains("remark") || name.contains("comment")) {
            return "Auto-generated note " + seq;
        }
        if (name.contains("url") || name.contains("link")) {
            return "https://example.com/item/" + seq;
        }
        if (name.contains("uuid") || name.contains("guid")) {
            return pseudoUuid(seq);
        }
        if (name.contains("created") || name.contains("updated") || name.contains("modified")) {
            // 给“时间字符串型字段”准备
            return "2024-01-15 " + String.format("%02d", (10 + (seq % 10))) + ":" + String.format("%02d", (seq % 60)) + ":00";
        }
        if (name.contains("name") && !name.contains("table") && !name.contains("schema")) {
            return "User " + seq;
        }
        if (name.contains("title") && name.contains("job")) {
            return ctx.faker().job().title();
        }
        if (name.contains("json")) {
            return "{\"id\":" + seq + ",\"label\":\"item-" + seq + "\"}";
        }

        String fallback = fieldName + "_" + seq;
        if (charCount != null && charCount > 0) {
            return fallback.length() > charCount ? fallback.substring(0, charCount) : fallback;
        }
        return fallback;
    }

    private static String pseudoUuid(int seq) {
        int a = seq + 1;
        int b = seq + 2;
        int c = seq + 3;
        int d = seq + 4;
        int e = seq + 5;
        return toHex8(a) + "-" + toHex4(b) + "-4" + toHex3(c) + "-a" + toHex3(d) + "-" + toHex12(e);
    }

    private static String toHex8(int n) {
        return String.format("%08x", n);
    }

    private static String toHex4(int n) {
        return String.format("%04x", n & 0xffff);
    }

    private static String toHex3(int n) {
        return String.format("%03x", n & 0xfff);
    }

    private static String toHex12(int n) {
        return String.format("%012x", n);
    }
}

