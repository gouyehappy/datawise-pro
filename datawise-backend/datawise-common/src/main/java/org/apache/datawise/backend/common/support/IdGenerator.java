package org.apache.datawise.backend.common.support;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.UUID;

public final class IdGenerator {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int SECURE_TOKEN_BYTES = 32;

    private IdGenerator() {
    }

    public static String shortId(String prefix) {
        return prefix + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    /**
     * High-entropy opaque token for bearer secrets (sessions, API handshake tickets).
     * 32 bytes → 64 hex chars (~256 bits).
     */
    public static String secureToken(String prefix) {
        byte[] bytes = new byte[SECURE_TOKEN_BYTES];
        SECURE_RANDOM.nextBytes(bytes);
        return (prefix != null ? prefix : "") + HexFormat.of().formatHex(bytes);
    }

    /** 相同 seed 始终生成相同 id，用于可按业务键定位的持久化记录。 */
    public static String stableShortId(String prefix, String seed) {
        String hash = UUID.nameUUIDFromBytes(seed.getBytes(StandardCharsets.UTF_8))
                .toString()
                .replace("-", "");
        return prefix + hash.substring(0, 12);
    }
}
