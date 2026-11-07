package org.apache.datawise.backend.connector.api.support;

import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.domain.ConnectionEntryDto;
import org.apache.datawise.backend.domain.ConnectionGroupDto;
import org.apache.datawise.backend.domain.ConnectionsCatalogDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ConnectionsCatalogMapper {

    private ConnectionsCatalogMapper() {
    }

    public static ConnectionsCatalogDto toDto(
                                              List<ConnectionGroupEntity> groups,
                                              List<ConnectionEntity> connections) {
        List<ConnectionGroupDto> groupDtos = groups.stream()
                .sorted(Comparator.comparingInt(ConnectionGroupEntity::getSortOrder))
                .map(ConnectionsCatalogMapper::toGroupDto)
                .toList();
        List<ConnectionEntryDto> connectionDtos = connections.stream()
                .sorted(Comparator.comparingInt(ConnectionEntity::getSortOrder))
                .map(ConnectionsCatalogMapper::toEntryDto)
                .toList();
        return new ConnectionsCatalogDto(1, groupDtos, connectionDtos);
    }

    public static ConnectionGroupEntity fromGroupDto(ConnectionGroupDto dto) {
        ConnectionGroupEntity entity = new ConnectionGroupEntity();
        entity.setId(dto.id());
        entity.setLabel(dto.label());
        entity.setParentId(dto.parentId());
        entity.setSortOrder(dto.sortOrder());
        entity.setExpanded(dto.expanded());
        entity.setUserId(dto.userId());
        entity.setProjectId(dto.projectId());
        return entity;
    }

    public static ConnectionEntity fromEntryDto(ConnectionEntryDto dto) {
        ConnectionEntity entity = ConnectionMapper.fromDto(
                dto.config(),
                dto.userId(),
                dto.groupId(),
                dto.id());
        entity.setSortOrder(dto.sortOrder());
        entity.setProjectId(dto.projectId());
        entity.setSharedProjectIds(
                dto.sharedProjectIds() != null ? dto.sharedProjectIds() : List.of());
        return entity;
    }

    public static ParsedEntities fromCatalog(ConnectionsCatalogDto catalog) {
        Map<String, ConnectionGroupEntity> groupsById = new LinkedHashMap<>();
        Map<String, ConnectionEntity> connectionsById = new LinkedHashMap<>();
        if (catalog.groups() != null) {
            for (ConnectionGroupDto group : catalog.groups()) {
                ConnectionGroupEntity entity = fromGroupDto(group);
                if (entity.getId() != null && !entity.getId().isBlank()) {
                    groupsById.put(entity.getId(), entity);
                }
            }
        }
        if (catalog.connections() != null) {
            for (ConnectionEntryDto entry : catalog.connections()) {
                ConnectionEntity entity = fromEntryDto(entry);
                if (entity.getId() != null && !entity.getId().isBlank()) {
                    connectionsById.put(entity.getId(), entity);
                }
            }
        }
        return new ParsedEntities(
                new ArrayList<>(groupsById.values()),
                new ArrayList<>(connectionsById.values()));
    }

    public record ParsedEntities(List<ConnectionGroupEntity> groups, List<ConnectionEntity> connections) {
    }

    private static ConnectionGroupDto toGroupDto(ConnectionGroupEntity entity) {
        return new ConnectionGroupDto(
                entity.getId(),
                entity.getLabel(),
                entity.getParentId(),
                entity.getSortOrder(),
                entity.isExpanded(),
                entity.getUserId(),
                entity.getProjectId());
    }

    private static ConnectionEntryDto toEntryDto(ConnectionEntity entity) {
        ConnectionConfig config = ConnectionMapper.toDto(entity);
        return new ConnectionEntryDto(
                entity.getId(),
                entity.getGroupId(),
                entity.getSortOrder(),
                entity.getUserId(),
                config,
                entity.getProjectId(),
                entity.getSharedProjectIds() == null || entity.getSharedProjectIds().isEmpty()
                        ? null
                        : List.copyOf(entity.getSharedProjectIds()));
    }
}
