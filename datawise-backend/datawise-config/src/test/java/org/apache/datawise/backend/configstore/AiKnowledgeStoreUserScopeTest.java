package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.AiKnowledgeEntry;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiKnowledgeStoreUserScopeTest {

    @TempDir
    Path tempDir;

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void guestSeesEmptyKnowledge() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        UserAiKnowledgeStore userStore = new UserAiKnowledgeStore(configDirectory, new ObjectMapper());
        UserAccessPolicy userAccessPolicy = new UserAccessPolicy();
        UserResourcePolicy resourcePolicy = new UserResourcePolicy(userAccessPolicy);
        AiKnowledgeStore store = new AiKnowledgeStore(userStore, resourcePolicy);

        UserContext.set(null, true, "guest-session");
        assertTrue(store.listAll().isEmpty());
    }

    @Test
    void registeredUsersHaveIsolatedKnowledge() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        UserAiKnowledgeStore userStore = new UserAiKnowledgeStore(configDirectory, new ObjectMapper());
        UserAccessPolicy userAccessPolicy = new UserAccessPolicy();
        UserResourcePolicy resourcePolicy = new UserResourcePolicy(userAccessPolicy);
        AiKnowledgeStore store = new AiKnowledgeStore(userStore, resourcePolicy);

        AiKnowledgeEntry userOneEntry = entry("k-1", "GMV");
        AiKnowledgeEntry userTwoEntry = entry("k-2", "Revenue");

        UserContext.set(1L, false, "session-1");
        store.replaceAll(List.of(userOneEntry));

        UserContext.set(2L, false, "session-2");
        store.replaceAll(List.of(userTwoEntry));

        UserContext.set(1L, false, "session-1");
        assertEquals(1, store.listAll().size());
        assertEquals("GMV", store.listAll().get(0).getTerm());

        UserContext.set(2L, false, "session-2");
        assertEquals(1, store.listAll().size());
        assertEquals("Revenue", store.listAll().get(0).getTerm());
    }

    private static AiKnowledgeEntry entry(String id, String term) {
        AiKnowledgeEntry entry = new AiKnowledgeEntry();
        entry.setId(id);
        entry.setTerm(term);
        entry.setDefinition(term + " definition");
        return entry;
    }
}
