package org.apache.datawise.backend.server.web;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Browser CORS allowlist shared by {@code WebConfig} and {@link SessionAuthFilter}.
 * Patterns use Spring {@code allowedOriginPatterns} syntax ({@code *} = any segment).
 */
public final class CorsOriginAllowlist {

    public static final List<String> DEFAULT_ORIGIN_PATTERNS = List.of(
            "http://localhost:*",
            "http://127.0.0.1:*",
            "https://localhost:*",
            "https://127.0.0.1:*",
            "app://local",
            "app://*"
    );

    private final String[] springPatterns;
    private final Pattern[] compiled;

    public CorsOriginAllowlist(List<String> originPatterns) {
        List<String> cleaned = new ArrayList<>();
        if (originPatterns != null) {
            for (String pattern : originPatterns) {
                if (pattern != null && !pattern.isBlank()) {
                    cleaned.add(pattern.trim());
                }
            }
        }
        this.springPatterns = cleaned.toArray(String[]::new);
        this.compiled = cleaned.stream().map(CorsOriginAllowlist::toRegex).toArray(Pattern[]::new);
    }

    public static CorsOriginAllowlist defaults() {
        return new CorsOriginAllowlist(DEFAULT_ORIGIN_PATTERNS);
    }

    public boolean isEmpty() {
        return springPatterns.length == 0;
    }

    public String[] springOriginPatterns() {
        return springPatterns.clone();
    }

    /** @return the origin string if allowed, otherwise {@code null} */
    public String resolveAllowedOrigin(String origin) {
        if (origin == null || origin.isBlank() || compiled.length == 0) {
            return null;
        }
        String trimmed = origin.trim();
        for (Pattern pattern : compiled) {
            if (pattern.matcher(trimmed).matches()) {
                return trimmed;
            }
        }
        return null;
    }

    private static Pattern toRegex(String springPattern) {
        StringBuilder sb = new StringBuilder("^");
        for (int i = 0; i < springPattern.length(); i++) {
            char c = springPattern.charAt(i);
            if (c == '*') {
                sb.append(".*");
            } else if (".[]{}()<>*+-=!?^$|\\".indexOf(c) >= 0) {
                sb.append('\\').append(c);
            } else {
                sb.append(c);
            }
        }
        sb.append('$');
        return Pattern.compile(sb.toString(), Pattern.CASE_INSENSITIVE);
    }
}
