package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.AiAnalysisCanvasEntry;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;

@Service
public class AnalysisCanvasStore {

    private final UserAnalysisCanvasStore userStore;
    private final UserResourcePolicy resourcePolicy;

    public AnalysisCanvasStore(UserAnalysisCanvasStore userStore, UserResourcePolicy resourcePolicy) {
        this.userStore = userStore;
        this.resourcePolicy = resourcePolicy;
    }

    public List<AiAnalysisCanvasEntry> listAll() {
        if (!resourcePolicy.canRead(UserResource.AI_ANALYSIS_CANVAS) || resourcePolicy.isGuestSession()) {
            return List.of();
        }
        return userStore.listAll(resourcePolicy.readUserIdFor(UserResource.AI_ANALYSIS_CANVAS));
    }

    public AiAnalysisCanvasEntry findById(String id) {
        if (!resourcePolicy.canRead(UserResource.AI_ANALYSIS_CANVAS) || resourcePolicy.isGuestSession()) {
            return null;
        }
        return userStore.findById(resourcePolicy.readUserIdFor(UserResource.AI_ANALYSIS_CANVAS), id);
    }

    public synchronized AiAnalysisCanvasEntry upsert(AiAnalysisCanvasEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        return userStore.upsert(resourcePolicy.requireRegisteredUserIdFor(UserResource.AI_ANALYSIS_CANVAS), entry);
    }

    public synchronized void removeById(String id) {
        userStore.removeById(resourcePolicy.requireRegisteredUserIdFor(UserResource.AI_ANALYSIS_CANVAS), id);
    }
}
