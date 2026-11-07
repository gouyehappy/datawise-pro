package org.apache.datawise.backend.controller.workspace;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.NotificationDto;
import org.apache.datawise.backend.domain.PushNotificationRequest;
import org.apache.datawise.backend.service.WorkspaceService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final WorkspaceService workspaceService;

    public NotificationController(WorkspaceService workspaceService) {
        this.workspaceService = workspaceService;
    }

    @GetMapping
    public ApiResponse<List<NotificationDto>> listNotifications() {
        return ApiResponse.ok(workspaceService.listNotifications());
    }

    @PostMapping
    public ApiResponse<NotificationDto> pushNotification(@RequestBody PushNotificationRequest request) {
        return ApiResponse.ok(workspaceService.pushNotification(request));
    }

    @PutMapping("/read-all")
    public ApiResponse<Void> markAllRead() {
        workspaceService.markAllNotificationsRead();
        return ApiResponse.ok(null);
    }

    @PutMapping("/{id}/read")
    public ApiResponse<Void> markRead(@PathVariable String id) {
        workspaceService.markNotificationRead(id);
        return ApiResponse.ok(null);
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> remove(@PathVariable String id) {
        workspaceService.removeNotification(id);
        return ApiResponse.ok(null);
    }

    @DeleteMapping("/clear-read")
    public ApiResponse<Void> clearRead() {
        workspaceService.clearReadNotifications();
        return ApiResponse.ok(null);
    }

    @DeleteMapping
    public ApiResponse<Void> clearAll(@RequestParam(defaultValue = "false") boolean all) {
        if (all) {
            workspaceService.clearAllNotifications();
        } else {
            workspaceService.clearReadNotifications();
        }
        return ApiResponse.ok(null);
    }
}
