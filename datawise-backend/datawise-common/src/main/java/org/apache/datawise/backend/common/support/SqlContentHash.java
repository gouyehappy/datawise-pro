package org.apache.datawise.backend.common.support;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.regex.Pattern;

/** Stable hash of SQL text for change detection (view-model / lineage). */
public final class SqlContentHash {

    private static final Pattern TRAILING_SEMICOLON = Pattern.compile(";\\s*$");

    private SqlContentHash() {
    }

    public static String normalize(String sql) {
        if (sql == null) {
            return "";
        }
        return TRAILING_SEMICOLON.matcher(sql.trim()).replaceAll("").trim();
    }

    public static String sha256(String sql) {
        String normalized = normalize(sql);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(normalized.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hash.length * 2);
            for (byte value : hash) {
                builder.append(String.format(Locale.ROOT, "%02x", value));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 not available", ex);
        }
    }
}
