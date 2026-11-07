package org.apache.datawise.backend.service;

import org.apache.datawise.backend.configstore.ApiTokenStore;
import org.apache.datawise.backend.configstore.FileApiTokenStore;
import org.apache.datawise.backend.model.ApiTokenEntity;
import org.apache.datawise.backend.security.ApiTokenScopes;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
class ApiTokenServiceTest {

    @TempDir
    Path tempDir;

    private ApiTokenService apiTokenService;

    @BeforeEach
    void setUp() throws Exception {
        var configDirectory = new org.apache.datawise.backend.configstore.ConfigDirectoryService(tempDir);
        var objectMapper = new com.fasterxml.jackson.databind.ObjectMapper()
                .findAndRegisterModules();
        ApiTokenStore store = new FileApiTokenStore(configDirectory, objectMapper);
        apiTokenService = new ApiTokenService(store, new BCryptPasswordEncoder());

        ApiTokenEntity token = new ApiTokenEntity();
        token.setId("ci-migration");
        token.setName("CI");
        token.setUserId(1L);
        apiTokenService.assignTokenSecret(token, "dw_test_migration_token");
        token.setScopes(List.of(ApiTokenScopes.MIGRATION));
        token.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        store.save(token);
    }

    @Test
    void authenticatesValidToken() {
        Optional<ApiTokenEntity> found = apiTokenService.authenticate("dw_test_migration_token");
        assertTrue(found.isPresent());
        assertEqualsUser(1L, found.get());
    }

    @Test
    void rejectsInvalidToken() {
        assertFalse(apiTokenService.authenticate("wrong-token").isPresent());
    }

    @Test
    void authenticatesUsingLookupIndexWithManyTokens() throws Exception {
        var configDirectory = new org.apache.datawise.backend.configstore.ConfigDirectoryService(tempDir);
        var objectMapper = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        ApiTokenStore store = new FileApiTokenStore(configDirectory, objectMapper);
        ApiTokenService service = new ApiTokenService(store, new BCryptPasswordEncoder());

        for (int index = 0; index < 20; index++) {
            ApiTokenEntity decoy = new ApiTokenEntity();
            decoy.setId("token-" + index);
            decoy.setUserId(2L);
            service.assignTokenSecret(decoy, "dw_decoy_token_" + index);
            decoy.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
            store.save(decoy);
        }

        ApiTokenEntity target = new ApiTokenEntity();
        target.setId("token-target");
        target.setUserId(9L);
        service.assignTokenSecret(target, "dw_target_token_value");
        target.setCreatedAt(Instant.parse("2026-01-02T00:00:00Z"));
        store.save(target);

        Optional<ApiTokenEntity> found = service.authenticate("dw_target_token_value");
        assertTrue(found.isPresent());
        assertEqualsUser(9L, found.get());
        assertEquals(
                ApiTokenService.tokenLookupDigest("dw_target_token_value"),
                found.get().getTokenLookup());
    }

    @Test
    void backfillsLookupForLegacyTokenWithoutIndex() throws Exception {
        var configDirectory = new org.apache.datawise.backend.configstore.ConfigDirectoryService(tempDir);
        var objectMapper = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        ApiTokenStore store = new FileApiTokenStore(configDirectory, objectMapper);
        ApiTokenService service = new ApiTokenService(store, new BCryptPasswordEncoder());

        ApiTokenEntity legacy = new ApiTokenEntity();
        legacy.setId("legacy-token");
        legacy.setUserId(4L);
        legacy.setTokenHash(service.hashToken("dw_legacy_plain"));
        legacy.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        store.save(legacy);

        Optional<ApiTokenEntity> found = service.authenticate("dw_legacy_plain");
        assertTrue(found.isPresent());
        assertEquals(
                ApiTokenService.tokenLookupDigest("dw_legacy_plain"),
                store.findById("legacy-token").orElseThrow().getTokenLookup());
    }

    @Test
    void capsLegacyTokenScanOnLookupMiss() throws Exception {
        var configDirectory = new org.apache.datawise.backend.configstore.ConfigDirectoryService(tempDir);
        var objectMapper = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        ApiTokenStore store = new FileApiTokenStore(configDirectory, objectMapper);
        ApiTokenService service = new ApiTokenService(store, new BCryptPasswordEncoder());

        for (int index = 0; index < 40; index++) {
            ApiTokenEntity legacy = new ApiTokenEntity();
            legacy.setId("legacy-" + index);
            legacy.setUserId(2L);
            legacy.setTokenHash(service.hashToken("dw_decoy_" + index));
            legacy.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
            store.save(legacy);
        }

        assertFalse(service.authenticate("dw_missing_token").isPresent());
    }

    private static void assertEqualsUser(long expected, ApiTokenEntity entity) {
        assertTrue(expected == entity.getUserId());
    }
}
