package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.datawise.backend.model.ScheduledTaskEntry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserScheduledTaskStoreTest {

    @TempDir
    Path configRoot;

    @Test
    void listAllAcrossUsers_scansAllUserDirectories() throws Exception {
        Files.createDirectories(configRoot.resolve("users/1"));
        Files.createDirectories(configRoot.resolve("users/2"));

        UserScheduledTaskStore store = new UserScheduledTaskStore(
                new ConfigDirectoryService(configRoot),
                new ObjectMapper().registerModule(new JavaTimeModule()));

        ScheduledTaskEntry task1 = task("task-a", "User one task");
        ScheduledTaskEntry task2 = task("task-b", "User two task");
        store.upsert(1L, task1);
        store.upsert(2L, task2);

        List<UserScheduledTaskStore.OwnedScheduledTask> owned = store.listAllAcrossUsers();

        assertEquals(2, owned.size());
        assertTrue(owned.stream().anyMatch(o -> o.userId() == 1L && "task-a".equals(o.entry().getId())));
        assertTrue(owned.stream().anyMatch(o -> o.userId() == 2L && "task-b".equals(o.entry().getId())));
    }

    private static ScheduledTaskEntry task(String id, String name) {
        ScheduledTaskEntry entry = new ScheduledTaskEntry();
        entry.setId(id);
        entry.setName(name);
        entry.setType(ScheduledTaskEntry.TYPE_SQL);
        entry.setCronExpression("0 0 * * * *");
        entry.setEnabled(true);
        entry.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        return entry;
    }
}
