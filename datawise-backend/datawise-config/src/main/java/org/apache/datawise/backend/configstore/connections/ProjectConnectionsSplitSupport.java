package org.apache.datawise.backend.configstore.connections;

import org.apache.datawise.backend.common.support.ConnectionsXmlCodec;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Partition / merge helpers for per-project connections.xml (PW-3-04).
 */
public final class ProjectConnectionsSplitSupport {

    private ProjectConnectionsSplitSupport() {
    }

    public record PartitionedCatalog(
            Map<String, List<ConnectionGroupEntity>> groupsByProject,
            Map<String, List<ConnectionEntity>> connectionsByProject) {
    }

    public static PartitionedCatalog partition(
                                               List<ConnectionGroupEntity> groups,
                                               List<ConnectionEntity> connections) {
        Map<String, List<ConnectionGroupEntity>> groupsByProject = new LinkedHashMap<>();
        Map<String, List<ConnectionEntity>> connectionsByProject = new LinkedHashMap<>();
        if (groups != null) {
            for (ConnectionGroupEntity group : groups) {
                String projectId = ProjectIds.normalizeOrDefault(group.getProjectId());
                groupsByProject.computeIfAbsent(projectId, ignored -> new ArrayList<>()).add(group);
            }
        }
        if (connections != null) {
            for (ConnectionEntity connection : connections) {
                String projectId = ProjectIds.normalizeOrDefault(connection.getProjectId());
                connectionsByProject.computeIfAbsent(projectId, ignored -> new ArrayList<>()).add(connection);
            }
        }
        // Ensure projects that only have groups or only connections still appear.
        Set<String> all = new LinkedHashSet<>();
        all.addAll(groupsByProject.keySet());
        all.addAll(connectionsByProject.keySet());
        for (String projectId : all) {
            groupsByProject.computeIfAbsent(projectId, ignored -> new ArrayList<>());
            connectionsByProject.computeIfAbsent(projectId, ignored -> new ArrayList<>());
        }
        return new PartitionedCatalog(groupsByProject, connectionsByProject);
    }

    /**
     * Merge catalogs; later catalogs override earlier ones on duplicate ids.
     */
    public static ConnectionsXmlCodec.ParsedCatalog merge(List<ConnectionsXmlCodec.ParsedCatalog> catalogs) {
        Map<String, ConnectionGroupEntity> groups = new LinkedHashMap<>();
        Map<String, ConnectionEntity> connections = new LinkedHashMap<>();
        if (catalogs != null) {
            for (ConnectionsXmlCodec.ParsedCatalog catalog : catalogs) {
                if (catalog == null) {
                    continue;
                }
                if (catalog.groups() != null) {
                    for (ConnectionGroupEntity group : catalog.groups()) {
                        if (group.getId() != null && !group.getId().isBlank()) {
                            groups.put(group.getId(), group);
                        }
                    }
                }
                if (catalog.connections() != null) {
                    for (ConnectionEntity connection : catalog.connections()) {
                        if (connection.getId() != null && !connection.getId().isBlank()) {
                            connections.put(connection.getId(), connection);
                        }
                    }
                }
            }
        }
        return new ConnectionsXmlCodec.ParsedCatalog(
                new ArrayList<>(groups.values()),
                new ArrayList<>(connections.values()));
    }
}
