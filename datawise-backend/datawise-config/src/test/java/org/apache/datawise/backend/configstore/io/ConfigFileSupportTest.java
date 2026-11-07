package org.apache.datawise.backend.configstore.io;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConfigFileSupportTest {

    @TempDir
    Path tempDir;

    @Test
    void writeJson_writesCompleteFileAtomically() throws Exception {
        Path target = tempDir.resolve("jobs.json");
        ObjectMapper mapper = new ObjectMapper();
        Map<String, Object> payload = Map.of("jobs", List.of(Map.of("id", "job-1", "status", "running")));

        ConfigFileSupport.writeJson(target, mapper, payload);

        assertTrue(Files.isRegularFile(target));
        @SuppressWarnings("unchecked")
        Map<String, Object> read = mapper.readValue(target.toFile(), Map.class);
        assertEquals("job-1", ((Map<?, ?>) ((List<?>) read.get("jobs")).get(0)).get("id"));
    }
}
