package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.ScheduledTaskEntry;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;

@Service
public class ScheduledTaskStore {

    private final UserScheduledTaskStore userStore;
    private final UserResourcePolicy resourcePolicy;

    public ScheduledTaskStore(UserScheduledTaskStore userStore, UserResourcePolicy resourcePolicy) {
        this.userStore = userStore;
        this.resourcePolicy = resourcePolicy;
    }

    public List<ScheduledTaskEntry> listAll() {
        if (!resourcePolicy.canRead(UserResource.SCHEDULED_TASKS) || resourcePolicy.isGuestSession()) {
            return List.of();
        }
        return userStore.listAll(resourcePolicy.readUserIdFor(UserResource.SCHEDULED_TASKS));
    }

    public ScheduledTaskEntry findById(String id) {
        if (!resourcePolicy.canRead(UserResource.SCHEDULED_TASKS) || resourcePolicy.isGuestSession()) {
            return null;
        }
        return userStore.findById(resourcePolicy.readUserIdFor(UserResource.SCHEDULED_TASKS), id);
    }

    public synchronized ScheduledTaskEntry upsert(ScheduledTaskEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        return userStore.upsert(resourcePolicy.requireRegisteredUserIdFor(UserResource.SCHEDULED_TASKS), entry);
    }

    /**
     * Scheduler claim/update path: no HTTP {@link org.apache.datawise.backend.security.UserContext}.
     * Callers must already know the owning userId (e.g. from {@link #listAllAcrossUsers()}).
     */
    public synchronized ScheduledTaskEntry upsertForUser(long userId, ScheduledTaskEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        return userStore.upsert(userId, entry);
    }

    public synchronized void removeById(String id) {
        userStore.removeById(resourcePolicy.requireRegisteredUserIdFor(UserResource.SCHEDULED_TASKS), id);
    }

    /**
     * 后台调度器遍历全部用户任务（无 HTTP 会话）。
     */
    public List<UserScheduledTaskStore.OwnedScheduledTask> listAllAcrossUsers() {
        return userStore.listAllAcrossUsers();
    }
}
