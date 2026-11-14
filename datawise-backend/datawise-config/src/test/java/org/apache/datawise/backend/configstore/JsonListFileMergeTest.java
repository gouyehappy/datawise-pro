package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Regression guard for P1-3: two writers holding separate in-memory mirrors of the
 * same JSON array must merge, not clobber each other's entries.
 */
class JsonListFileMergeTest {

    @TempDir
    Path tempDir;

    private static final TypeReference<List<Item>> ITEMS = new TypeReference<>() {
    };

    @Test
    void staleMirrorDoesNotOverwriteConcurrentWriter() {
        ObjectMapper mapper = new ObjectMapper();
        ConfigDirectoryService cd = new ConfigDirectoryService(tempDir);

        JsonListFile<Item> writerA = new JsonListFile<>(cd, mapper, "items.json", ITEMS);
        JsonListFile<Item> writerB = new JsonListFile<>(cd, mapper, "items.json", ITEMS);

        writerA.append(new Item("a"));
        writerB.append(new Item("b"));

        List<Item> fromDisk = new JsonListFile<>(cd, mapper, "items.json", ITEMS).snapshot();
        assertEquals(2, fromDisk.size(), "both writes must survive");
        assertEquals(List.of("a", "b"), fromDisk.stream().map(Item::getId).toList());
    }

    @Test
    void removeIfReReadsBeforeApplying() {
        ObjectMapper mapper = new ObjectMapper();
        ConfigDirectoryService cd = new ConfigDirectoryService(tempDir);

        JsonListFile<Item> writerA = new JsonListFile<>(cd, mapper, "items.json", ITEMS);
        JsonListFile<Item> writerB = new JsonListFile<>(cd, mapper, "items.json", ITEMS);

        writerA.append(new Item("keep"));
        writerA.append(new Item("drop"));
        writerB.removeIf(item -> "drop".equals(item.getId()));

        List<Item> fromDisk = new JsonListFile<>(cd, mapper, "items.json", ITEMS).snapshot();
        assertEquals(List.of("keep"), fromDisk.stream().map(Item::getId).toList());
    }

    public static class Item {

        private String id;

        public Item() {
        }

        public Item(String id) {
            this.id = id;
        }

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }
    }
}
