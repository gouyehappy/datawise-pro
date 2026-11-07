package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.SchemaDriftMonitorEntry;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;

@Service
public class SchemaDriftMonitorStore {

    private final UserSchemaDriftMonitorStore userStore;
    private final UserResourcePolicy resourcePolicy;

    public SchemaDriftMonitorStore(UserSchemaDriftMonitorStore userStore, UserResourcePolicy resourcePolicy) {
        this.userStore = userStore;
        this.resourcePolicy = resourcePolicy;
    }

    public List<SchemaDriftMonitorEntry> listAll() {
        if (!resourcePolicy.canRead(UserResource.SCHEMA_DRIFT_MONITORS) || resourcePolicy.isGuestSession()) {
            return List.of();
        }
        return userStore.listAll(resourcePolicy.readUserIdFor(UserResource.SCHEMA_DRIFT_MONITORS));
    }

    public SchemaDriftMonitorEntry findById(String id) {
        if (!resourcePolicy.canRead(UserResource.SCHEMA_DRIFT_MONITORS) || resourcePolicy.isGuestSession()) {
            return null;
        }
        return userStore.findById(resourcePolicy.readUserIdFor(UserResource.SCHEMA_DRIFT_MONITORS), id);
    }

    public synchronized SchemaDriftMonitorEntry upsert(SchemaDriftMonitorEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        return userStore.upsert(resourcePolicy.requireRegisteredUserIdFor(UserResource.SCHEMA_DRIFT_MONITORS), entry);
    }

    public synchronized void removeById(String id) {
        userStore.removeById(resourcePolicy.requireRegisteredUserIdFor(UserResource.SCHEMA_DRIFT_MONITORS), id);
    }
}
