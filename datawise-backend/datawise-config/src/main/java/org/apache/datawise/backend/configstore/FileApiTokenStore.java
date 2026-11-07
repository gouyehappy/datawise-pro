package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.ApiTokenEntity;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/** API tokens for headless automation; persisted in {@code config/api-tokens.json}. */
@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "file", matchIfMissing = true)
public class FileApiTokenStore implements ApiTokenStore {

    private final JsonListFile<ApiTokenEntity> tokens;

    public FileApiTokenStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.tokens = new JsonListFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.API_TOKENS,
                new TypeReference<List<ApiTokenEntity>>() {
                });
    }

    @Override
    public List<ApiTokenEntity> listAll() {
        return tokens.snapshot();
    }

    @Override
    public Optional<ApiTokenEntity> findById(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        String normalized = id.trim();
        return tokens.stream()
                .filter(token -> normalized.equals(token.getId()))
                .findFirst();
    }

    @Override
    public Optional<ApiTokenEntity> findByTokenLookup(String tokenLookup) {
        if (tokenLookup == null || tokenLookup.isBlank()) {
            return Optional.empty();
        }
        String normalized = tokenLookup.trim();
        return tokens.stream()
                .filter(token -> normalized.equals(token.getTokenLookup()))
                .findFirst();
    }

    @Override
    public ApiTokenEntity save(ApiTokenEntity token) {
        if (token.getTenantId() == null || token.getTenantId().isBlank()) {
            String fromContext = org.apache.datawise.backend.security.UserContext.getTenantId();
            token.setTenantId(org.apache.datawise.backend.domain.TenantIds.normalizeOrDefault(fromContext));
        }
        return tokens.upsert(token, existing -> existing.getId().equals(token.getId()));
    }
}
