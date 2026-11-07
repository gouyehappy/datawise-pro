package org.apache.datawise.backend.jdbc.ssh;

import com.jcraft.jsch.JSch;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Appends legacy SSH algorithms so older servers (ssh-rsa host keys, SHA-1 KEX) remain reachable.
 * mwiede JSch disables these by default; many enterprise bastions still require them.
 */
public final class SshJschCompatibility {

    private static final Object LOCK = new Object();
    private static volatile boolean applied;

    private SshJschCompatibility() {
    }

    public static void applyGlobalDefaults() {
        if (applied) {
            return;
        }
        synchronized (LOCK) {
            if (applied) {
                return;
            }
            mergeConfig("server_host_key", "ssh-rsa");
            mergeConfig("PubkeyAcceptedAlgorithms", "ssh-rsa");
            mergeConfig("kex",
                    "diffie-hellman-group14-sha1",
                    "diffie-hellman-group-exchange-sha1",
                    "diffie-hellman-group1-sha1"
            );
            applied = true;
        }
    }

    private static void mergeConfig(String key, String... extras) {
        String current = JSch.getConfig(key);
        List<String> merged = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        appendTokens(merged, seen, current);
        for (String extra : extras) {
            appendTokens(merged, seen, extra);
        }
        JSch.setConfig(key, String.join(",", merged));
    }

    private static void appendTokens(List<String> merged, Set<String> seen, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        for (String token : value.split(",")) {
            String normalized = token.trim().toLowerCase(Locale.ROOT);
            if (normalized.isEmpty() || !seen.add(normalized)) {
                continue;
            }
            merged.add(token.trim());
        }
    }
}
