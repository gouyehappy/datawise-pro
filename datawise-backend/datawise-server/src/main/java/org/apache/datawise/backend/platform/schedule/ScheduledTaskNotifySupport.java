package org.apache.datawise.backend.platform.schedule;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.apache.datawise.backend.domain.PushNotificationRequest;
import org.apache.datawise.backend.model.ScheduledTaskEntry;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.outbound.OutboundNotifySupport;
import org.apache.datawise.backend.service.workspace.WorkspaceNotificationService;
import org.slf4j.Logger;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Workspace + outbound webhook notifications for scheduled task runs.
 */
final class ScheduledTaskNotifySupport {

    private ScheduledTaskNotifySupport() {
    }

    static void notifyRun(
            Logger log,
            WorkspaceNotificationService notificationService,
            OutboundNotifySupport outboundNotifySupport,
            ScheduledTaskEntry entry,
            boolean ok,
            String errorMessage,
            Map<String, Object> digest
    ) {
        try {
            String titleKey = ok ? "scheduledTaskOk" : "scheduledTaskFailed";
            String detail = ok
                    ? (entry.getLastRunMessage() != null ? entry.getLastRunMessage() : "")
                    : (errorMessage != null ? errorMessage : "");
            notificationService.pushNotification(new PushNotificationRequest(
                    "workspace",
                    titleKey,
                    titleKey,
                    Map.of(
                            "name", entry.getName() != null ? entry.getName() : entry.getId(),
                            "type", entry.getType() != null ? entry.getType() : "",
                            "message", detail
                    )
            ));
            publishOutbound(outboundNotifySupport, entry, ok, detail, digest);
        } catch (RuntimeException ex) {
            ExceptionLogging.warn(log, "scheduledTask.notification taskId=" + entry.getId(), ex);
        }
    }

    static void publishOutbound(
            OutboundNotifySupport outboundNotifySupport,
            ScheduledTaskEntry entry,
            boolean ok,
            String detail,
            Map<String, Object> digest
    ) {
        Long userId = UserContext.getUserId();
        if (userId == null) {
            return;
        }
        String name = entry.getName() != null ? entry.getName() : entry.getId();
        String type = entry.getType() != null ? entry.getType() : "";
        Map<String, Object> baseData = new LinkedHashMap<>();
        baseData.put("name", name);
        baseData.put("type", type);
        baseData.put("message", detail != null ? detail : "");

        outboundNotifySupport.publish(
                ok ? OutboundEventType.SCHEDULED_TASK_OK : OutboundEventType.SCHEDULED_TASK_FAILED,
                baseData,
                userId
        );
        if (ScheduledTaskEntry.TYPE_DATA_QUALITY.equals(type)) {
            Map<String, Object> data = new LinkedHashMap<>(baseData);
            if (digest != null) {
                data.putAll(digest);
            }
            outboundNotifySupport.publish(
                    ok ? OutboundEventType.DATA_QUALITY_OK : OutboundEventType.DATA_QUALITY_FAILED,
                    data,
                    userId
            );
        }
        if (ScheduledTaskEntry.TYPE_HTTP_TRIGGER.equals(type)) {
            Map<String, Object> data = new LinkedHashMap<>(baseData);
            if (digest != null) {
                data.putAll(digest);
            }
            outboundNotifySupport.publish(
                    ok ? OutboundEventType.ORCHESTRATION_TRIGGERED : OutboundEventType.ORCHESTRATION_FAILED,
                    data,
                    userId
            );
        }
        if (ok && digest != null && !digest.isEmpty()
                && !ScheduledTaskEntry.TYPE_DATA_QUALITY.equals(type)
                && !ScheduledTaskEntry.TYPE_HTTP_TRIGGER.equals(type)) {
            Map<String, Object> data = new LinkedHashMap<>(baseData);
            data.putAll(digest);
            String body = detail != null && !detail.isBlank() ? detail : name;
            data.put("body", body);
            outboundNotifySupport.publish(OutboundEventType.INSIGHT_DIGEST, data, body, userId);
        }
    }
}
