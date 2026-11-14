package org.apache.datawise.backend.configstore.io;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.AtomicFileWrites;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public final class ConfigFileSupport {

    private ConfigFileSupport() {
    }

    public static boolean exists(Path path) {
        return Files.isRegularFile(path);
    }

    public static <T> List<T> readList(Path path, ObjectMapper mapper, TypeReference<List<T>> type) {
        if (!exists(path)) {
            return new ArrayList<>();
        }
        try {
            List<T> items = mapper.readValue(path.toFile(), type);
            return items != null ? new ArrayList<>(items) : new ArrayList<>();
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read config file: " + path, ex);
        }
    }

    public static <T> T readObject(Path path, ObjectMapper mapper, Class<T> type, T fallback) {
        if (!exists(path)) {
            return fallback;
        }
        try {
            return mapper.readValue(path.toFile(), type);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read config file: " + path, ex);
        }
    }

    public static void writeJson(Path path, ObjectMapper mapper, Object payload) throws IOException {
        Path parent = path.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        // Serialize first, then write through the temp→fsync→replace path so a crash
        // cannot leave a half-written JSON document behind.
        byte[] bytes = mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(payload);
        AtomicFileWrites.writeBytes(path, bytes);
    }
}
