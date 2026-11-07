package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.SemanticMetricEntry;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;

@Service
public class SemanticMetricStore {

    private final UserSemanticMetricStore userStore;
    private final UserResourcePolicy resourcePolicy;

    public SemanticMetricStore(UserSemanticMetricStore userStore, UserResourcePolicy resourcePolicy) {
        this.userStore = userStore;
        this.resourcePolicy = resourcePolicy;
    }

    public List<SemanticMetricEntry> listAll() {
        if (!resourcePolicy.canRead(UserResource.SEMANTIC_METRICS) || resourcePolicy.isGuestSession()) {
            return List.of();
        }
        return userStore.listAll(resourcePolicy.readUserIdFor(UserResource.SEMANTIC_METRICS));
    }

    public List<SemanticMetricEntry> listScoped(String connectionId, String database) {
        if (!resourcePolicy.canRead(UserResource.SEMANTIC_METRICS) || resourcePolicy.isGuestSession()) {
            return List.of();
        }
        return userStore.listScoped(
                resourcePolicy.readUserIdFor(UserResource.SEMANTIC_METRICS),
                connectionId,
                database);
    }

    public synchronized SemanticMetricEntry upsert(SemanticMetricEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        return userStore.upsert(resourcePolicy.requireRegisteredUserIdFor(UserResource.SEMANTIC_METRICS), entry);
    }

    public synchronized void replaceAll(List<SemanticMetricEntry> next) {
        userStore.replaceAll(
                resourcePolicy.requireRegisteredUserIdFor(UserResource.SEMANTIC_METRICS),
                next != null ? next : List.of());
    }

    public synchronized void removeById(String id) {
        userStore.removeById(resourcePolicy.requireRegisteredUserIdFor(UserResource.SEMANTIC_METRICS), id);
    }
}
