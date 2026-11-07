package org.apache.datawise.backend.ai.analysis.python;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PythonDockerSupportTest {

    @Test
    void buildsNetworkIsolatedDockerCommand() {
        List<String> command = PythonDockerSupport.buildDockerRunCommand(
                "docker",
                "python:3.12-slim",
                "512m",
                "/tmp/work",
                List.of("python", "-I", "-B", "analysis.py")
        );
        assertEquals("docker", command.get(0));
        assertTrue(command.contains("--network"));
        assertTrue(command.contains("none"));
        assertTrue(command.contains("/tmp/work:/workspace:ro"));
        assertTrue(command.contains("python:3.12-slim"));
    }
}
