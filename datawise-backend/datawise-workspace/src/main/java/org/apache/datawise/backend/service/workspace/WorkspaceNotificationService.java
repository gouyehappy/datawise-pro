package org.apache.datawise.backend.service.workspace;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.WorkspaceStore;
import org.apache.datawise.backend.domain.NotificationDto;
import org.apache.datawise.backend.domain.PushNotificationRequest;
import org.apache.datawise.backend.model.NotificationEntity;
import org.apache.datawise.backend.service.UserAccountService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
public class WorkspaceNotificationService {

    private static final Logger log = LoggerFactory.getLogger(WorkspaceNotificationService.class);

    private final WorkspaceStore workspaceStore;
    private final ObjectMapper objectMapper;
    private final UserAccountService userAccountService;

    public WorkspaceNotificationService(
            WorkspaceStore workspaceStore,
            ObjectMapper objectMapper,
            UserAccountService userAccountService
    ) {
        this.workspaceStore = workspaceStore;
        this.objectMapper = objectMapper;
        this.userAccountService = userAccountService;
    }

    public List<NotificationDto> listNotifications() {
        Long userId = userAccountService.requireUserId();
        return workspaceStore.findNotificationsByUserId(userId).stream()
                .map(this::toNotificationDto)
                .toList();
    }

    public NotificationDto pushNotification(PushNotificationRequest request) {
        Long userId = userAccountService.requireUserId();
        NotificationEntity entity = new NotificationEntity();
        entity.setId(IdGenerator.shortId("notify-"));
        entity.setUserId(userId);
        entity.setCategory(request.category() != null ? request.category() : "info");
        entity.setTitleKey(request.titleKey());
        entity.setBodyKey(request.bodyKey());
        entity.setReadFlag(false);
        entity.setCreatedAt(Instant.now());
        if (request.params() != null && !request.params().isEmpty()) {
            try {
                entity.setParamsJson(objectMapper.writeValueAsString(request.params()));
            } catch (Exception ex) {
                ExceptionLogging.recoverable(log, "Failed to serialize notification params", ex);
                entity.setParamsJson(null);
            }
        }
        workspaceStore.saveNotification(entity);
        return toNotificationDto(entity);
    }

    public void markAllNotificationsRead() {
        workspaceStore.markAllNotificationsReadForUser(userAccountService.requireUserId());
    }

    public void markNotificationRead(String id) {
        Long userId = userAccountService.requireUserId();
        workspaceStore.findNotificationById(id).ifPresent(entity -> {
            if (entity.getUserId().equals(userId)) {
                entity.setReadFlag(true);
                workspaceStore.saveNotification(entity);
            }
        });
    }

    public void removeNotification(String id) {
        workspaceStore.removeNotificationForUser(id, userAccountService.requireUserId());
    }

    public void clearReadNotifications() {
        workspaceStore.clearReadNotificationsForUser(userAccountService.requireUserId());
    }

    public void clearAllNotifications() {
        workspaceStore.clearAllNotificationsForUser(userAccountService.requireUserId());
    }

    private NotificationDto toNotificationDto(NotificationEntity entity) {
        Map<String, Object> params = null;
        if (entity.getParamsJson() != null && !entity.getParamsJson().isBlank()) {
            try {
                params = objectMapper.readValue(entity.getParamsJson(), new TypeReference<>() {
                });
            } catch (Exception ex) {
                ExceptionLogging.recoverable(log, "Failed to parse notification params JSON", ex);
                params = null;
            }
        }
        return new NotificationDto(
                entity.getId(),
                entity.getCategory(),
                entity.getTitleKey(),
                entity.getBodyKey(),
                params,
                entity.getCreatedAt().toEpochMilli(),
                entity.isReadFlag()
        );
    }
}
