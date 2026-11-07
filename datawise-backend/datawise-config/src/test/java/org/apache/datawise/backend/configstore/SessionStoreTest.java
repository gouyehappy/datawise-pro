package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.configstore.FileSessionStore;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.datawise.backend.config.AuthSessionProperties;
import org.apache.datawise.backend.config.DatawiseConfigProperties;
import org.apache.datawise.backend.domain.AuthSessionPolicyDto;
import org.apache.datawise.backend.model.SessionEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionStoreTest {

    @TempDir
    Path configDir;

    private SessionStore sessionStore;
    private AuthSessionPolicyService policyService;

    @BeforeEach
    void setUp() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
        AuthSessionProperties properties = new AuthSessionProperties();
        properties.setTtlMinutes(60);
        properties.setSlidingRenewal(true);
        DatawiseConfigProperties configProperties = new DatawiseConfigProperties();
        configProperties.setDir(configDir.toString());
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(configProperties);
        policyService = new AuthSessionPolicyService(configDirectory, objectMapper, properties);
        sessionStore = new FileSessionStore(configDirectory, objectMapper, policyService);
    }

    @Test
    void create_persistsSessionWithExpiry() {
        SessionEntity session = new SessionEntity();
        session.setId("session-test");
        session.setUserId(1L);
        session.setGuest(false);

        SessionEntity saved = sessionStore.create(session);

        assertTrue(saved.getExpiresAt().isAfter(Instant.now().plus(59, ChronoUnit.MINUTES)));
        assertTrue(sessionStore.authenticate("session-test").isPresent());
    }

    @Test
    void authenticate_renewsExpiryWhenSlidingEnabled() {
        SessionEntity session = new SessionEntity();
        session.setId("session-renew");
        session.setUserId(2L);
        session.setGuest(false);
        SessionEntity saved = sessionStore.create(session);
        Instant firstExpiry = saved.getExpiresAt();

        SessionEntity renewed = sessionStore.authenticate("session-renew").orElseThrow();

        assertTrue(renewed.getExpiresAt().isAfter(firstExpiry.minusSeconds(1)));
    }

    @Test
    void policyCanBeUpdatedFromSettingsFile() {
        policyService.updatePolicy(new AuthSessionPolicyDto(90, true));

        assertEquals(90, policyService.ttlMinutes());
    }
}
