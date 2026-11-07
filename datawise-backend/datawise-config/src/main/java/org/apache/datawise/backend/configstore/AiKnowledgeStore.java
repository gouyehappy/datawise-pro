package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.AiKnowledgeEntry;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;

/**
 * 业务词条持久化：由 {@link UserResourcePolicy} 裁决访客只读与注册用户隔离。
 */
@Service
public class AiKnowledgeStore {

    private final UserAiKnowledgeStore userStore;
    private final UserResourcePolicy resourcePolicy;

    public AiKnowledgeStore(UserAiKnowledgeStore userStore, UserResourcePolicy resourcePolicy) {
        this.userStore = userStore;
        this.resourcePolicy = resourcePolicy;
    }

    public List<AiKnowledgeEntry> listAll() {
        if (!resourcePolicy.canRead(UserResource.AI_KNOWLEDGE)) {
            return List.of();
        }
        if (resourcePolicy.isGuestSession()) {
            return List.of();
        }
        return userStore.listAll(resourcePolicy.readUserIdFor(UserResource.AI_KNOWLEDGE));
    }

    public List<AiKnowledgeEntry> listScoped(String connectionId, String database) {
        if (!resourcePolicy.canRead(UserResource.AI_KNOWLEDGE) || resourcePolicy.isGuestSession()) {
            return List.of();
        }
        return userStore.listScoped(
                resourcePolicy.readUserIdFor(UserResource.AI_KNOWLEDGE),
                connectionId,
                database);
    }

    public synchronized AiKnowledgeEntry upsert(AiKnowledgeEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        return userStore.upsert(resourcePolicy.requireRegisteredUserIdFor(UserResource.AI_KNOWLEDGE), entry);
    }

    public synchronized void replaceAll(List<AiKnowledgeEntry> next) {
        userStore.replaceAll(
                resourcePolicy.requireRegisteredUserIdFor(UserResource.AI_KNOWLEDGE),
                next != null ? next : List.of());
    }

    public synchronized void removeById(String id) {
        userStore.removeById(resourcePolicy.requireRegisteredUserIdFor(UserResource.AI_KNOWLEDGE), id);
    }

    static boolean matchesScope(AiKnowledgeEntry entry, String connectionId, String database) {
        if (entry.getConnectionId() != null && !entry.getConnectionId().isBlank()) {
            if (connectionId == null || !entry.getConnectionId().equals(connectionId)) {
                return false;
            }
        }
        if (entry.getDatabase() != null && !entry.getDatabase().isBlank()) {
            if (database == null || !entry.getDatabase().equalsIgnoreCase(database)) {
                return false;
            }
        }
        return true;
    }

    public Stream<AiKnowledgeEntry> streamScoped(String connectionId, String database) {
        return listScoped(connectionId, database).stream();
    }
}
