package org.apache.datawise.backend.configstore.io;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.team.TeamSnapshot;
import org.apache.datawise.backend.model.TeamEntity;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JsonSnapshotFileTest {

    @TempDir
    Path tempDir;

    @Test
    void replacePersistsSnapshotRoundTrip() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper();
        JsonSnapshotFile<TeamSnapshot> file = new JsonSnapshotFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.TEAMS,
                TeamSnapshot.class,
                TeamSnapshot.empty());

        TeamEntity team = new TeamEntity();
        team.setId("team-1");
        team.setName("Alpha");
        file.replace(new TeamSnapshot(List.of(team), List.of(), List.of(), List.of(), List.of(), List.of(), List.of()));

        JsonSnapshotFile<TeamSnapshot> reloaded = new JsonSnapshotFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.TEAMS,
                TeamSnapshot.class,
                TeamSnapshot.empty());
        assertEquals(1, reloaded.get().teams().size());
        assertEquals("Alpha", reloaded.get().teams().get(0).getName());
        assertTrue(tempDir.resolve(ConfigPaths.TEAMS).toFile().isFile());
    }
}
