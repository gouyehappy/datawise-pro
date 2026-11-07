package org.apache.datawise.backend.service;

import org.apache.datawise.backend.configstore.ApiTokenStore;
import org.apache.datawise.backend.model.ApiTokenEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;

@Service
public class ApiTokenService {

    private static final int LAST_USED_TOUCH_INTERVAL_SECONDS = 60;
    /** Caps bcrypt work on lookup miss to avoid DoS via legacy token table scans. */
    private static final int MAX_LEGACY_TOKEN_SCANS = 32;

    private static final Logger log = LoggerFactory.getLogger(ApiTokenService.class);

    private final ApiTokenStore apiTokenStore;
    private final PasswordEncoder passwordEncoder;

    public ApiTokenService(ApiTokenStore apiTokenStore, PasswordEncoder passwordEncoder) {
        this.apiTokenStore = apiTokenStore;
        this.passwordEncoder = passwordEncoder;
    }

    public Optional<ApiTokenEntity> authenticate(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return Optional.empty();
        }
        String token = rawToken.trim();
        String lookup = tokenLookupDigest(token);
        Optional<ApiTokenEntity> indexed = apiTokenStore.findByTokenLookup(lookup);
        if (indexed.isPresent()) {
            ApiTokenEntity entity = indexed.get();
            if (matchesToken(token, entity)) {
                touchLastUsed(entity);
                return Optional.of(entity);
            }
            return Optional.empty();
        }
        int legacyScanned = 0;
        for (ApiTokenEntity entity : apiTokenStore.listAll()) {
            if (entity.getTokenLookup() != null && !entity.getTokenLookup().isBlank()) {
                continue;
            }
            if (legacyScanned++ >= MAX_LEGACY_TOKEN_SCANS) {
                log.warn(
                        "Stopped legacy API token scan after {} entries; regenerate tokens to populate lookup index",
                        MAX_LEGACY_TOKEN_SCANS);
                break;
            }
            if (matchesToken(token, entity)) {
                backfillTokenLookup(entity, lookup);
                touchLastUsed(entity);
                return Optional.of(entity);
            }
        }
        return Optional.empty();
    }

    public String hashToken(String rawToken) {
        return passwordEncoder.encode(rawToken);
    }

    public void assignTokenSecret(ApiTokenEntity entity, String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new IllegalArgumentException("token secret is required");
        }
        String token = rawToken.trim();
        entity.setTokenHash(hashToken(token));
        entity.setTokenLookup(tokenLookupDigest(token));
    }

    private boolean matchesToken(String token, ApiTokenEntity entity) {
        return entity.getTokenHash() != null
                && !entity.getTokenHash().isBlank()
                && passwordEncoder.matches(token, entity.getTokenHash());
    }

    private void backfillTokenLookup(ApiTokenEntity entity, String lookup) {
        entity.setTokenLookup(lookup);
        apiTokenStore.save(entity);
    }

    private void touchLastUsed(ApiTokenEntity entity) {
        Instant now = Instant.now();
        Instant previous = entity.getLastUsedAt();
        if (previous != null && previous.isAfter(now.minusSeconds(LAST_USED_TOUCH_INTERVAL_SECONDS))) {
            return;
        }
        entity.setLastUsedAt(now);
        apiTokenStore.save(entity);
    }

    static String tokenLookupDigest(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashed);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 not available", ex);
        }
    }
}
