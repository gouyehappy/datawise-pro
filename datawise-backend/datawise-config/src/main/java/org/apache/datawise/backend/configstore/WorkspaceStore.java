package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ExportTaskEntity;
import org.apache.datawise.backend.model.NotificationEntity;
import org.apache.datawise.backend.model.SavedConsoleEntity;
import org.apache.datawise.backend.model.SqlHistoryEntity;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Service
public class WorkspaceStore {

    private final SqlHistoryStore sqlHistoryStore;
    private final JsonListFile<SavedConsoleEntity> savedConsoles;
    private final JsonListFile<ExportTaskEntity> exportTasks;
    private final JsonListFile<NotificationEntity> notifications;

    public WorkspaceStore(
                          SqlHistoryStore sqlHistoryStore,
                          ConfigDirectoryService configDirectory,
                          ObjectMapper objectMapper) {
        this.sqlHistoryStore = sqlHistoryStore;
        this.savedConsoles = new JsonListFile<>(
                configDirectory, objectMapper, ConfigPaths.SAVED_CONSOLES, new TypeReference<>() {
                });
        this.exportTasks = new JsonListFile<>(
                configDirectory, objectMapper, ConfigPaths.EXPORT_TASKS, new TypeReference<>() {
                });
        this.notifications = new JsonListFile<>(
                configDirectory, objectMapper, ConfigPaths.NOTIFICATIONS, new TypeReference<>() {
                });
    }

    public List<SqlHistoryEntity> findSqlHistoryByUserId(Long userId) {
        return sqlHistoryStore.findByUserId(userId);
    }

    public List<SqlHistoryEntity> findSqlHistoryByUserIds(List<Long> userIds) {
        return sqlHistoryStore.findByUserIds(userIds);
    }

    public SqlHistoryEntity saveSqlHistory(SqlHistoryEntity entity) {
        return sqlHistoryStore.save(entity);
    }

    public List<SavedConsoleEntity> findSavedConsolesByUserId(Long userId) {
        String tenantId = TenantScopedConfigSupport.currentTenantId();
        return savedConsoles.stream()
                .filter(item -> userId.equals(item.getUserId()) && matchesTenant(item.getTenantId(), tenantId))
                .sorted(Comparator.comparing(SavedConsoleEntity::getUpdatedAt).reversed())
                .toList();
    }

    public List<SavedConsoleEntity> findSavedConsolesByIds(List<String> consoleIds) {
        if (consoleIds == null || consoleIds.isEmpty()) {
            return List.of();
        }
        Set<String> idSet = new HashSet<>(consoleIds);
        String tenantId = TenantScopedConfigSupport.currentTenantId();
        return savedConsoles.stream()
                .filter(item -> idSet.contains(item.getId()) && matchesTenant(item.getTenantId(), tenantId))
                .sorted(Comparator.comparing(SavedConsoleEntity::getUpdatedAt).reversed())
                .toList();
    }

    public Optional<SavedConsoleEntity> findSavedConsoleByUserIdAndName(Long userId, String name) {
        String tenantId = TenantScopedConfigSupport.currentTenantId();
        return savedConsoles.stream()
                .filter(item -> userId.equals(item.getUserId())
                        && name.equals(item.getName())
                        && matchesTenant(item.getTenantId(), tenantId))
                .findFirst();
    }

    public SavedConsoleEntity saveSavedConsole(SavedConsoleEntity entity) {
        if (entity.getTenantId() == null || entity.getTenantId().isBlank()) {
            entity.setTenantId(TenantScopedConfigSupport.currentTenantId());
        }
        return savedConsoles.upsert(entity, item -> item.getId().equals(entity.getId()));
    }

    private static boolean matchesTenant(String entityTenantId, String currentTenantId) {
        return TenantIds.normalizeOrDefault(currentTenantId)
                .equals(TenantIds.normalizeOrDefault(entityTenantId));
    }

    public List<ExportTaskEntity> findExportTasksByUserId(Long userId) {
        return exportTasks.stream()
                .filter(item -> userId.equals(item.getUserId()))
                .sorted(Comparator.comparing(ExportTaskEntity::getCreatedAt).reversed())
                .toList();
    }

    public Optional<ExportTaskEntity> findExportTaskById(String id) {
        return exportTasks.stream().filter(item -> id.equals(item.getId())).findFirst();
    }

    public ExportTaskEntity saveExportTask(ExportTaskEntity entity) {
        return exportTasks.upsert(entity, item -> item.getId().equals(entity.getId()));
    }

    public List<NotificationEntity> findNotificationsByUserId(Long userId) {
        return notifications.stream()
                .filter(item -> userId.equals(item.getUserId()))
                .sorted(Comparator.comparing(NotificationEntity::getCreatedAt).reversed())
                .toList();
    }

    public NotificationEntity saveNotification(NotificationEntity entity) {
        return notifications.upsert(entity, item -> item.getId().equals(entity.getId()));
    }

    public Optional<NotificationEntity> findNotificationById(String id) {
        return notifications.stream().filter(item -> id.equals(item.getId())).findFirst();
    }

    public void markAllNotificationsReadForUser(Long userId) {
        notifications.updateMatching(
                item -> userId.equals(item.getUserId()),
                item -> item.setReadFlag(true));
    }

    public void removeNotificationForUser(String id, Long userId) {
        notifications.removeIf(item -> id.equals(item.getId()) && userId.equals(item.getUserId()));
    }

    public void clearReadNotificationsForUser(Long userId) {
        notifications.removeIf(item -> userId.equals(item.getUserId()) && item.isReadFlag());
    }

    public void clearAllNotificationsForUser(Long userId) {
        notifications.removeIf(item -> userId.equals(item.getUserId()));
    }
}
