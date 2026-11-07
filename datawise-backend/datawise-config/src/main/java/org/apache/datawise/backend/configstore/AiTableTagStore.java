package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.AiTableTagEntry;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
public class AiTableTagStore {

    private final UserAiTableTagStore userStore;
    private final UserResourcePolicy resourcePolicy;

    public AiTableTagStore(UserAiTableTagStore userStore, UserResourcePolicy resourcePolicy) {
        this.userStore = userStore;
        this.resourcePolicy = resourcePolicy;
    }

    public List<AiTableTagEntry> listScoped(String connectionId, String database) {
        if (!resourcePolicy.canRead(UserResource.AI_TABLE_TAGS) || resourcePolicy.isGuestSession()) {
            return List.of();
        }
        return userStore.listScoped(
                resourcePolicy.readUserIdFor(UserResource.AI_TABLE_TAGS),
                connectionId,
                database);
    }

    public List<AiTableTagEntry> listAll() {
        if (!resourcePolicy.canRead(UserResource.AI_TABLE_TAGS) || resourcePolicy.isGuestSession()) {
            return List.of();
        }
        return userStore.listAll(resourcePolicy.readUserIdFor(UserResource.AI_TABLE_TAGS));
    }

    public synchronized AiTableTagEntry upsert(AiTableTagEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        return userStore.replaceScoped(resourcePolicy.requireRegisteredUserIdFor(UserResource.AI_TABLE_TAGS), entry);
    }

    public synchronized void removeScoped(String connectionId, String database, String tableName) {
        userStore.removeScoped(
                resourcePolicy.requireRegisteredUserIdFor(UserResource.AI_TABLE_TAGS),
                connectionId,
                database,
                tableName);
    }

    public synchronized void removeById(String id) {
        userStore.removeById(resourcePolicy.requireRegisteredUserIdFor(UserResource.AI_TABLE_TAGS), id);
    }

    /** No-op for guests; registered users drop all tags for the connection. */
    public synchronized void removeByConnectionId(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }
        if (!resourcePolicy.canWrite(UserResource.AI_TABLE_TAGS) || resourcePolicy.isGuestSession()) {
            return;
        }
        userStore.removeByConnectionId(
                resourcePolicy.requireRegisteredUserIdFor(UserResource.AI_TABLE_TAGS),
                connectionId);
    }

    /** Self-heal orphan tags; no-op for guests. */
    public synchronized int pruneMissingConnections(Set<String> validConnectionIds) {
        if (!resourcePolicy.canWrite(UserResource.AI_TABLE_TAGS) || resourcePolicy.isGuestSession()) {
            return 0;
        }
        return userStore.removeMissingConnections(
                resourcePolicy.requireRegisteredUserIdFor(UserResource.AI_TABLE_TAGS),
                validConnectionIds);
    }
}
