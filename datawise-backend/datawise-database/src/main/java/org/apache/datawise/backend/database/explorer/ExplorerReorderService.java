package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.ConnectionWritePolicy;
import org.apache.datawise.backend.service.ExplorerCatalogPersistence;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * Reorder connection catalog groups/connections via before/after/inside drops.
 * Sibling order is persisted as contiguous {@code sortOrder} values (0..n-1).
 */
@Service
public class ExplorerReorderService {

    public static final String POSITION_BEFORE = "before";
    public static final String POSITION_AFTER = "after";
    public static final String POSITION_INSIDE = "inside";

    private final ExplorerGroupService groupService;
    private final ConnectionExecutionContext connectionContext;
    private final ConnectionVisibilityService connectionVisibilityService;
    private final ConnectionWritePolicy connectionWritePolicy;
    private final ExplorerCatalogPersistence catalogPersistence;

    public ExplorerReorderService(
            ExplorerGroupService groupService,
            ConnectionExecutionContext connectionContext,
            ConnectionVisibilityService connectionVisibilityService,
            ConnectionWritePolicy connectionWritePolicy,
            ExplorerCatalogPersistence catalogPersistence
    ) {
        this.groupService = groupService;
        this.connectionContext = connectionContext;
        this.connectionVisibilityService = connectionVisibilityService;
        this.connectionWritePolicy = connectionWritePolicy;
        this.catalogPersistence = catalogPersistence;
    }

    public List<TreeNode> reorder(String nodeId, String targetId, String position) {
        connectionContext.requireUserId();
        if (nodeId == null || nodeId.isBlank() || targetId == null || targetId.isBlank()) {
            throw new IllegalArgumentException("EXPLORER_REORDER_IDS_REQUIRED");
        }
        String normalizedPosition = normalizePosition(position);
        if (nodeId.equals(targetId) && !POSITION_INSIDE.equals(normalizedPosition)) {
            return groupService.buildGroupTree();
        }

        Optional<ConnectionGroupEntity> draggedGroup =
                connectionVisibilityService.resolveGroupEntity(nodeId);
        Optional<ConnectionEntity> draggedConnection =
                connectionVisibilityService.resolveConnectionEntity(nodeId);
        if (draggedGroup.isEmpty() && draggedConnection.isEmpty()) {
            throw new IllegalArgumentException("EXPLORER_NODE_NOT_FOUND");
        }

        Optional<ConnectionGroupEntity> targetGroup =
                connectionVisibilityService.resolveGroupEntity(targetId);
        Optional<ConnectionEntity> targetConnection =
                connectionVisibilityService.resolveConnectionEntity(targetId);
        if (targetGroup.isEmpty() && targetConnection.isEmpty()) {
            throw new IllegalArgumentException("EXPLORER_NODE_NOT_FOUND");
        }

        if (draggedGroup.isPresent()) {
            reorderGroup(draggedGroup.get(), targetGroup, targetConnection, normalizedPosition);
        } else {
            connectionWritePolicy.requireConnectionWritable(nodeId);
            reorderConnection(draggedConnection.get(), targetGroup, targetConnection, normalizedPosition);
        }
        return groupService.buildGroupTree();
    }

    private void reorderGroup(
            ConnectionGroupEntity dragged,
            Optional<ConnectionGroupEntity> targetGroup,
            Optional<ConnectionEntity> targetConnection,
            String position
    ) {
        if (POSITION_INSIDE.equals(position)) {
            if (targetGroup.isEmpty()) {
                throw new IllegalArgumentException("EXPLORER_REORDER_INVALID_TARGET");
            }
            moveGroupUnder(dragged, targetGroup.get().getId());
            return;
        }
        if (targetGroup.isPresent()) {
            ConnectionGroupEntity target = targetGroup.get();
            if (Objects.equals(dragged.getId(), target.getId())) {
                return;
            }
            if (isGroupDescendantOf(target.getId(), dragged.getId())) {
                throw new IllegalArgumentException("EXPLORER_REORDER_CYCLE");
            }
            String parentKey = parentKey(target.getParentId());
            placeGroupAmongSiblings(dragged, parentKey, target.getId(), position);
            return;
        }
        // before/after a connection → become sibling subgroup of that connection's group
        ConnectionEntity targetConn = targetConnection.orElseThrow();
        String parentKey = parentKey(targetConn.getGroupId());
        // Place among child groups of the connection's parent group (append relative to groups only)
        List<ConnectionGroupEntity> siblings = siblingGroups(parentKey);
        if (siblings.isEmpty()) {
            placeGroupAmongSiblings(dragged, parentKey, null, POSITION_AFTER);
        } else {
            ConnectionGroupEntity anchor = POSITION_BEFORE.equals(position)
                    ? siblings.get(0)
                    : siblings.get(siblings.size() - 1);
            placeGroupAmongSiblings(dragged, parentKey, anchor.getId(), position);
        }
    }

    private void reorderConnection(
            ConnectionEntity dragged,
            Optional<ConnectionGroupEntity> targetGroup,
            Optional<ConnectionEntity> targetConnection,
            String position
    ) {
        if (POSITION_INSIDE.equals(position)) {
            if (targetGroup.isEmpty()) {
                throw new IllegalArgumentException("EXPLORER_REORDER_INVALID_TARGET");
            }
            placeConnectionInGroup(dragged, targetGroup.get().getId(), null, POSITION_AFTER);
            return;
        }
        if (targetConnection.isPresent()) {
            ConnectionEntity target = targetConnection.get();
            if (Objects.equals(dragged.getId(), target.getId())) {
                return;
            }
            placeConnectionInGroup(dragged, target.getGroupId(), target.getId(), position);
            return;
        }
        // before/after a group → move into that group (append by after, prepend by before)
        ConnectionGroupEntity target = targetGroup.orElseThrow();
        List<ConnectionEntity> connections = sortedConnections(target.getId());
        if (connections.isEmpty()) {
            placeConnectionInGroup(dragged, target.getId(), null, POSITION_AFTER);
            return;
        }
        ConnectionEntity anchor = POSITION_BEFORE.equals(position)
                ? connections.get(0)
                : connections.get(connections.size() - 1);
        placeConnectionInGroup(dragged, target.getId(), anchor.getId(), position);
    }

    private void moveGroupUnder(ConnectionGroupEntity dragged, String newParentId) {
        if (Objects.equals(dragged.getId(), newParentId)) {
            throw new IllegalArgumentException("EXPLORER_REORDER_CYCLE");
        }
        if (isGroupDescendantOf(newParentId, dragged.getId())) {
            throw new IllegalArgumentException("EXPLORER_REORDER_CYCLE");
        }
        String oldParentKey = parentKey(dragged.getParentId());
        String newParentKey = parentKey(newParentId);
        if (oldParentKey.equals(newParentKey) && Objects.equals(nullToEmpty(dragged.getParentId()), newParentId)) {
            // already direct child — append to end
            placeGroupAmongSiblings(dragged, newParentKey, null, POSITION_AFTER);
            return;
        }
        ConnectionGroupEntity parent = connectionVisibilityService.resolveGroupEntity(newParentId)
                .orElseThrow(() -> new IllegalArgumentException("EXPLORER_GROUP_NOT_FOUND"));
        dragged.setParentId(parent.getId());
        if (parent.getProjectId() != null && !parent.getProjectId().isBlank()) {
            dragged.setProjectId(parent.getProjectId());
        }
        List<ConnectionGroupEntity> siblings = siblingGroups(newParentKey).stream()
                .filter(group -> !group.getId().equals(dragged.getId()))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        siblings.add(dragged);
        reindexGroups(siblings);
        if (!oldParentKey.equals(newParentKey)) {
            reindexGroups(siblingGroups(oldParentKey).stream()
                    .filter(group -> !group.getId().equals(dragged.getId()))
                    .toList());
        }
    }

    private void placeGroupAmongSiblings(
            ConnectionGroupEntity dragged,
            String parentKey,
            String targetId,
            String position
    ) {
        String oldParentKey = parentKey(dragged.getParentId());
        String desiredParentId = parentKey.isEmpty() ? null : parentKey;
        dragged.setParentId(desiredParentId);
        if (desiredParentId != null) {
            connectionVisibilityService.resolveGroupEntity(desiredParentId).ifPresent(parent -> {
                if (parent.getProjectId() != null && !parent.getProjectId().isBlank()) {
                    dragged.setProjectId(parent.getProjectId());
                }
            });
        }

        List<ConnectionGroupEntity> siblings = siblingGroups(parentKey).stream()
                .filter(group -> !group.getId().equals(dragged.getId()))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        int insertAt = siblings.size();
        if (targetId != null) {
            int targetIndex = indexOfId(siblings, targetId);
            if (targetIndex >= 0) {
                insertAt = POSITION_BEFORE.equals(position) ? targetIndex : targetIndex + 1;
            }
        }
        siblings.add(Math.min(insertAt, siblings.size()), dragged);
        reindexGroups(siblings);
        if (!oldParentKey.equals(parentKey)) {
            reindexGroups(siblingGroups(oldParentKey).stream()
                    .filter(group -> !group.getId().equals(dragged.getId()))
                    .toList());
        }
    }

    private void placeConnectionInGroup(
            ConnectionEntity dragged,
            String groupId,
            String targetConnectionId,
            String position
    ) {
        ConnectionGroupEntity group = connectionVisibilityService.resolveGroupEntity(groupId)
                .orElseThrow(() -> new IllegalArgumentException("EXPLORER_GROUP_NOT_FOUND"));
        String oldGroupId = dragged.getGroupId();
        dragged.setGroupId(group.getId());
        if (group.getProjectId() != null && !group.getProjectId().isBlank()) {
            dragged.setProjectId(group.getProjectId());
        }

        List<ConnectionEntity> siblings = sortedConnections(groupId).stream()
                .filter(connection -> !connection.getId().equals(dragged.getId()))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        int insertAt = siblings.size();
        if (targetConnectionId != null) {
            int targetIndex = indexOfConnectionId(siblings, targetConnectionId);
            if (targetIndex >= 0) {
                insertAt = POSITION_BEFORE.equals(position) ? targetIndex : targetIndex + 1;
            }
        }
        siblings.add(Math.min(insertAt, siblings.size()), dragged);
        reindexConnections(siblings);
        if (oldGroupId != null && !oldGroupId.equals(groupId)) {
            reindexConnections(sortedConnections(oldGroupId).stream()
                    .filter(connection -> !connection.getId().equals(dragged.getId()))
                    .toList());
        }
    }

    private void reindexGroups(List<ConnectionGroupEntity> ordered) {
        for (int i = 0; i < ordered.size(); i++) {
            ConnectionGroupEntity group = ordered.get(i);
            if (group.getSortOrder() != i) {
                group.setSortOrder(i);
            }
            catalogPersistence.saveGroup(group);
        }
    }

    private void reindexConnections(List<ConnectionEntity> ordered) {
        for (int i = 0; i < ordered.size(); i++) {
            ConnectionEntity connection = ordered.get(i);
            if (connection.getSortOrder() != i) {
                connection.setSortOrder(i);
            }
            catalogPersistence.saveConnection(connection);
        }
    }

    private List<ConnectionGroupEntity> siblingGroups(String parentKey) {
        return connectionVisibilityService.visibleCatalogForCurrentUser().groups().stream()
                .filter(group -> parentKey(group.getParentId()).equals(parentKey))
                .sorted(Comparator.comparingInt(ConnectionGroupEntity::getSortOrder)
                        .thenComparing(group -> group.getId() == null ? "" : group.getId()))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
    }

    private List<ConnectionEntity> sortedConnections(String groupId) {
        return connectionVisibilityService.connectionsForGroup(groupId).stream()
                .sorted(Comparator.comparingInt(ConnectionEntity::getSortOrder)
                        .thenComparing(connection -> connection.getId() == null ? "" : connection.getId()))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
    }

    private boolean isGroupDescendantOf(String nodeId, String ancestorId) {
        String current = nodeId;
        int guard = 0;
        while (current != null && !current.isBlank() && guard++ < 256) {
            if (current.equals(ancestorId)) {
                return true;
            }
            Optional<ConnectionGroupEntity> group = connectionVisibilityService.resolveGroupEntity(current);
            if (group.isEmpty()) {
                return false;
            }
            current = group.get().getParentId();
        }
        return false;
    }

    private static String normalizePosition(String position) {
        if (position == null || position.isBlank()) {
            throw new IllegalArgumentException("EXPLORER_REORDER_POSITION_REQUIRED");
        }
        String value = position.trim().toLowerCase();
        if (!POSITION_BEFORE.equals(value)
                && !POSITION_AFTER.equals(value)
                && !POSITION_INSIDE.equals(value)) {
            throw new IllegalArgumentException("EXPLORER_REORDER_POSITION_INVALID");
        }
        return value;
    }

    private static String parentKey(String parentId) {
        return parentId == null || parentId.isBlank() ? "" : parentId.trim();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static int indexOfId(List<ConnectionGroupEntity> groups, String id) {
        for (int i = 0; i < groups.size(); i++) {
            if (id.equals(groups.get(i).getId())) {
                return i;
            }
        }
        return -1;
    }

    private static int indexOfConnectionId(List<ConnectionEntity> connections, String id) {
        for (int i = 0; i < connections.size(); i++) {
            if (id.equals(connections.get(i).getId())) {
                return i;
            }
        }
        return -1;
    }
}
