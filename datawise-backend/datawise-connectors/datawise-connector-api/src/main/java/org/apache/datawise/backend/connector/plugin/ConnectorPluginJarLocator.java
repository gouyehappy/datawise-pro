package org.apache.datawise.backend.connector.plugin;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Locates connector plugin JAR files under {@code config/plugins} by connector id convention:
 * {@code datawise-connector-{id}-*.jar} (prefers {@code *-plugin.jar}).
 */
public final class ConnectorPluginJarLocator {

    private ConnectorPluginJarLocator() {
    }

    public static Optional<String> findJarName(Path pluginsDir, String connectorId) {
        List<String> matches = listJarNamesForConnector(pluginsDir, connectorId);
        if (matches.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(matches.get(0));
    }

    /**
     * Matching JARs for a connector id, preferred first ({@code *-plugin.jar}, then newest name).
     */
    public static List<String> listJarNamesForConnector(Path pluginsDir, String connectorId) {
        if (pluginsDir == null || connectorId == null || connectorId.isBlank() || !Files.isDirectory(pluginsDir)) {
            return List.of();
        }
        String id = connectorId.trim().toLowerCase(Locale.ROOT);
        String prefix = "datawise-connector-" + id + "-";
        List<String> names = new ArrayList<>();
        try (Stream<Path> stream = Files.list(pluginsDir)) {
            stream.filter(Files::isRegularFile)
                    .map(path -> path.getFileName().toString())
                    .filter(name -> name.toLowerCase(Locale.ROOT).endsWith(".jar"))
                    .filter(name -> name.toLowerCase(Locale.ROOT).startsWith(prefix))
                    .forEach(names::add);
        } catch (IOException ex) {
            return List.of();
        }
        names.sort(Comparator
                .comparing((String name) -> !name.toLowerCase(Locale.ROOT).endsWith("-plugin.jar"))
                .thenComparing(Comparator.reverseOrder()));
        return List.copyOf(names);
    }

    public static List<String> listAllJarNames(Path pluginsDir) {
        if (pluginsDir == null || !Files.isDirectory(pluginsDir)) {
            return List.of();
        }
        try (Stream<Path> stream = Files.list(pluginsDir)) {
            return stream.filter(Files::isRegularFile)
                    .map(path -> path.getFileName().toString())
                    .filter(name -> name.toLowerCase(Locale.ROOT).endsWith(".jar"))
                    .sorted()
                    .toList();
        } catch (IOException ex) {
            return List.of();
        }
    }
}
