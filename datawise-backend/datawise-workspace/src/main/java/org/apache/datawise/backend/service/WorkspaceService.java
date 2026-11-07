package org.apache.datawise.backend.service;

import org.apache.datawise.backend.domain.AppendSqlLogRequest;
import org.apache.datawise.backend.domain.CreateExportTaskRequest;
import org.apache.datawise.backend.domain.ExportTaskDto;
import org.apache.datawise.backend.domain.NotificationDto;
import org.apache.datawise.backend.domain.PushNotificationRequest;
import org.apache.datawise.backend.domain.SaveConsoleRequest;
import org.apache.datawise.backend.domain.SavedConsoleDto;
import org.apache.datawise.backend.domain.SqlExecutionStatsDto;
import org.apache.datawise.backend.domain.SqlLogDto;
import org.apache.datawise.backend.service.workspace.WorkspaceConsoleService;
import org.apache.datawise.backend.service.workspace.WorkspaceExportService;
import org.apache.datawise.backend.service.workspace.WorkspaceNotificationService;
import org.apache.datawise.backend.service.workspace.WorkspaceSqlLogService;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Backward-compatible facade for workspace user data (SQL logs, consoles, exports, notifications).
 */
@Service
public class WorkspaceService {

    private final WorkspaceSqlLogService sqlLogService;
    private final WorkspaceConsoleService consoleService;
    private final WorkspaceExportService exportService;
    private final WorkspaceNotificationService notificationService;

    public WorkspaceService(
            WorkspaceSqlLogService sqlLogService,
            WorkspaceConsoleService consoleService,
            WorkspaceExportService exportService,
            WorkspaceNotificationService notificationService
    ) {
        this.sqlLogService = sqlLogService;
        this.consoleService = consoleService;
        this.exportService = exportService;
        this.notificationService = notificationService;
    }

    public List<SqlLogDto> listSqlLogs() {
        return sqlLogService.listSqlLogs();
    }

    public SqlExecutionStatsDto getSqlExecutionStats(
            String connectionId,
            int days,
            int limit,
            long slowThresholdMs
    ) {
        return sqlLogService.getSqlExecutionStats(connectionId, days, limit, slowThresholdMs);
    }

    public SqlLogDto appendSqlLog(AppendSqlLogRequest request) {
        return sqlLogService.appendSqlLog(request);
    }

    public List<SavedConsoleDto> listSavedConsoles() {
        return consoleService.listSavedConsoles();
    }

    public SavedConsoleDto saveConsole(SaveConsoleRequest request) {
        return consoleService.saveConsole(request);
    }

    public List<ExportTaskDto> listExportTasks() {
        return exportService.listExportTasks();
    }

    public ExportTaskDto createExportTask(CreateExportTaskRequest request) {
        return exportService.createExportTask(request);
    }

    public List<NotificationDto> listNotifications() {
        return notificationService.listNotifications();
    }

    public NotificationDto pushNotification(PushNotificationRequest request) {
        return notificationService.pushNotification(request);
    }

    public void markAllNotificationsRead() {
        notificationService.markAllNotificationsRead();
    }

    public void markNotificationRead(String id) {
        notificationService.markNotificationRead(id);
    }

    public void removeNotification(String id) {
        notificationService.removeNotification(id);
    }

    public void clearReadNotifications() {
        notificationService.clearReadNotifications();
    }

    public void clearAllNotifications() {
        notificationService.clearAllNotifications();
    }
}
