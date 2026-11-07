package org.apache.datawise.backend.common.support;

import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.Locale;

/**
 * Normalizes connection environment labels to {@code dev | staging | prod | custom}.
 * Legacy uppercase values and free-text labels are migrated on read.
 */
public final class ConnectionEnvironmentSupport {

    public static final String DEV = "dev";
    public static final String STAGING = "staging";
    public static final String PROD = "prod";
    public static final String CUSTOM = "custom";

    private static final int CUSTOM_LABEL_MAX_LENGTH = 32;

    private ConnectionEnvironmentSupport() {
    }

    public record NormalizedEnvironment(String env, String envCustom) {
    }

    public static NormalizedEnvironment normalize(String env, String envCustom) {
        if (env == null || env.isBlank()) {
            return new NormalizedEnvironment(DEV, null);
        }
        String trimmed = env.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        return switch (lower) {
            case "dev", "development", "test" -> new NormalizedEnvironment(DEV, null);
            case "staging", "stage", "uat" -> new NormalizedEnvironment(STAGING, null);
            case "prod", "production" -> new NormalizedEnvironment(PROD, null);
            case "custom" -> new NormalizedEnvironment(CUSTOM, sanitizeCustom(envCustom));
            default -> new NormalizedEnvironment(CUSTOM, sanitizeCustom(trimmed));
        };
    }

    public static void applyToEntity(ConnectionEntity entity) {
        if (entity == null) {
            return;
        }
        NormalizedEnvironment normalized = normalize(entity.getEnv(), entity.getEnvCustom());
        entity.setEnv(normalized.env());
        entity.setEnvCustom(normalized.envCustom());
    }

    /** Whether the connection is tagged as development. */
    public static boolean isDevelopment(ConnectionEntity entity) {
        if (entity == null) {
            return true;
        }
        NormalizedEnvironment normalized = normalize(entity.getEnv(), entity.getEnvCustom());
        return DEV.equals(normalized.env());
    }

    /** Whether the connection is tagged as production (incl. custom labels containing "prod"). */
    public static boolean isProduction(ConnectionEntity entity) {
        if (entity == null) {
            return false;
        }
        NormalizedEnvironment normalized = normalize(entity.getEnv(), entity.getEnvCustom());
        if (PROD.equals(normalized.env())) {
            return true;
        }
        String custom = normalized.envCustom();
        return custom != null && custom.toLowerCase(Locale.ROOT).contains("prod");
    }

    private static String sanitizeCustom(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() <= CUSTOM_LABEL_MAX_LENGTH) {
            return trimmed;
        }
        return trimmed.substring(0, CUSTOM_LABEL_MAX_LENGTH);
    }
}
