package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.config.AuthSessionProperties;
import org.apache.datawise.backend.configstore.io.ConfigFileSupport;
import org.apache.datawise.backend.configstore.io.ConfigPersistence;
import org.apache.datawise.backend.domain.AuthSessionPolicyDto;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * 会话策略：application.yml 提供默认值，{@code config/auth-session.json} 可覆盖（设置页可写）。
 */
@Service
public class AuthSessionPolicyService {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final AuthSessionProperties defaults;

    public AuthSessionPolicyService(
                                    ConfigDirectoryService configDirectory,
                                    ObjectMapper objectMapper,
                                    AuthSessionProperties defaults) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.defaults = defaults;
    }

    public AuthSessionPolicyDto currentPolicy() {
        AuthSessionPolicyDto stored = readStoredPolicy();
        if (stored != null) {
            return normalize(stored);
        }
        return fromDefaults();
    }

    public synchronized AuthSessionPolicyDto updatePolicy(AuthSessionPolicyDto next) {
        AuthSessionPolicyDto normalized = normalize(next);
        try {
            configDirectory.ensureExists();
            ConfigPersistence.writeJson(
                    configDirectory,
                    objectMapper,
                    ConfigPaths.AUTH_SESSION_POLICY,
                    normalized);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to write auth session policy", ex);
        }
        return normalized;
    }

    public int ttlMinutes() {
        return currentPolicy().ttlMinutes();
    }

    public boolean slidingRenewal() {
        return currentPolicy().slidingRenewal();
    }

    /**
     * Whether sliding renewal should rewrite the session now.
     * Renew only when less than half of TTL remains (min 2 minutes), to avoid write amplification
     * on every authenticated request.
     */
    public boolean shouldRenewNow(Instant expiresAt) {
        if (!slidingRenewal()) {
            return false;
        }
        if (expiresAt == null) {
            return true;
        }
        long ttl = ttlMinutes();
        long renewWhenRemainingMinutes = Math.max(2L, ttl / 2L);
        Instant threshold = Instant.now().plus(renewWhenRemainingMinutes, ChronoUnit.MINUTES);
        return !expiresAt.isAfter(threshold);
    }

    private AuthSessionPolicyDto readStoredPolicy() {
        Path path = configDirectory.resolve(ConfigPaths.AUTH_SESSION_POLICY);
        if (!ConfigFileSupport.exists(path)) {
            return null;
        }
        try {
            return objectMapper.readValue(path.toFile(), AuthSessionPolicyDto.class);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read auth session policy", ex);
        }
    }

    private AuthSessionPolicyDto fromDefaults() {
        return new AuthSessionPolicyDto(defaults.getTtlMinutes(), defaults.isSlidingRenewal());
    }

    private AuthSessionPolicyDto normalize(AuthSessionPolicyDto policy) {
        int ttl = policy == null ? defaults.getTtlMinutes() : policy.ttlMinutes();
        if (ttl < 5 || ttl > 24 * 60) {
            throw new IllegalArgumentException("ttlMinutes must be between 5 and 1440");
        }
        boolean sliding = policy == null || policy.slidingRenewal();
        return new AuthSessionPolicyDto(ttl, sliding);
    }
}
