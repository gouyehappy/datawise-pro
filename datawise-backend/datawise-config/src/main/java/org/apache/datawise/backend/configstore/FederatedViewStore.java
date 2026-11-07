package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.FederatedViewEntry;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;

@Service
public class FederatedViewStore {

    private final UserFederatedViewStore userStore;
    private final UserResourcePolicy resourcePolicy;

    public FederatedViewStore(UserFederatedViewStore userStore, UserResourcePolicy resourcePolicy) {
        this.userStore = userStore;
        this.resourcePolicy = resourcePolicy;
    }

    public List<FederatedViewEntry> listAll() {
        if (!resourcePolicy.canRead(UserResource.FEDERATED_VIEWS) || resourcePolicy.isGuestSession()) {
            return List.of();
        }
        return userStore.listAll(resourcePolicy.readUserIdFor(UserResource.FEDERATED_VIEWS));
    }

    public FederatedViewEntry findById(String id) {
        if (!resourcePolicy.canRead(UserResource.FEDERATED_VIEWS) || resourcePolicy.isGuestSession()) {
            return null;
        }
        return userStore.findById(resourcePolicy.readUserIdFor(UserResource.FEDERATED_VIEWS), id);
    }

    public synchronized FederatedViewEntry upsert(FederatedViewEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        return userStore.upsert(resourcePolicy.requireRegisteredUserIdFor(UserResource.FEDERATED_VIEWS), entry);
    }

    public synchronized void removeById(String id) {
        userStore.removeById(resourcePolicy.requireRegisteredUserIdFor(UserResource.FEDERATED_VIEWS), id);
    }
}
