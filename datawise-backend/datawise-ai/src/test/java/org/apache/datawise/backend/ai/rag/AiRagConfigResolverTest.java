package org.apache.datawise.backend.ai.rag;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.ai.domain.EffectiveAiRagConfig;
import org.apache.datawise.backend.ai.support.UserAiRagSupport;
import org.apache.datawise.backend.configstore.UserAppConfigStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiRagConfigResolverTest {

    @Mock
    private UserAppConfigStore userAppConfigStore;

    private AiRagProperties serverDefaults;
    private AiRagConfigResolver resolver;

    @BeforeEach
    void setUp() {
        serverDefaults = new AiRagProperties();
        serverDefaults.setVectorStore("none");
        serverDefaults.getPgvector().setJdbcUrl("jdbc:postgresql://server/db");
        serverDefaults.getPgvector().setUsername("server");
        serverDefaults.getPgvector().setPassword("server-pass");
        resolver = new AiRagConfigResolver(serverDefaults, userAppConfigStore);
    }

    @Test
    void resolve_usesServerDefaultsWhenUserHasNoRagSection() {
        when(userAppConfigStore.readAppConfig(1L)).thenReturn(Optional.of(Map.of("ai", Map.of())));

        org.apache.datawise.backend.security.UserContext.runAs(
                new org.apache.datawise.backend.security.UserContext.Snapshot(1L, false, "test"),
                () -> {
                    EffectiveAiRagConfig config = resolver.resolveForCurrentUser();
                    assertEquals("none", config.vectorStore());
                    assertFalse(config.userOverridden());
                    assertEquals("jdbc:postgresql://server/db", config.pgvector().jdbcUrl());
                }
        );
    }

    @Test
    void resolve_userVectorStoreOverridesServerDefault() {
        when(userAppConfigStore.readAppConfig(1L)).thenReturn(Optional.of(Map.of(
                "ai", Map.of(
                        "rag", Map.of("vectorStore", "memory")
                )
        )));

        org.apache.datawise.backend.security.UserContext.runAs(
                new org.apache.datawise.backend.security.UserContext.Snapshot(1L, false, "test"),
                () -> {
                    EffectiveAiRagConfig config = resolver.resolveForCurrentUser();
                    assertEquals("memory", config.vectorStore());
                    assertTrue(config.isVectorStoreEnabled());
                    assertTrue(config.userOverridden());
                }
        );
    }

    @Test
    void resolve_userPgvectorPartiallyOverridesServer() {
        when(userAppConfigStore.readAppConfig(1L)).thenReturn(Optional.of(Map.of(
                "ai", Map.of(
                        "rag", Map.of(
                                "vectorStore", "pgvector",
                                "pgvector", Map.of(
                                        "jdbcUrl", "jdbc:postgresql://user/db",
                                        "username", "user"
                                )
                        )
                )
        )));

        org.apache.datawise.backend.security.UserContext.runAs(
                new org.apache.datawise.backend.security.UserContext.Snapshot(1L, false, "test"),
                () -> {
                    EffectiveAiRagConfig config = resolver.resolveForCurrentUser();
                    assertEquals("pgvector", config.vectorStore());
                    assertEquals("jdbc:postgresql://user/db", config.pgvector().jdbcUrl());
                    assertEquals("user", config.pgvector().username());
                    assertEquals("server-pass", config.pgvector().password());
                }
        );
    }

    @Test
    void readUserRagPreferences_ignoresEmptySection() {
        assertTrue(UserAiRagSupport.readUserRagPreferences(Map.of("ai", Map.of("rag", Map.of()))).isEmpty());
    }
}
