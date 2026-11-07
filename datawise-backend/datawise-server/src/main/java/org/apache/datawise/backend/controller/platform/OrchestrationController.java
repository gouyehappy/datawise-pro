package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.OrchestrationStatusDto;
import org.apache.datawise.backend.domain.OrchestrationStatusRequest;
import org.apache.datawise.backend.domain.OrchestrationTriggerRequest;
import org.apache.datawise.backend.domain.ScheduledTaskDto;
import org.apache.datawise.backend.platform.schedule.ScheduledTaskService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Inbound hooks for external orchestrators and outbound DAG/job status polling.
 */
@RestController
@RequestMapping("/api/platform/orchestration")
public class OrchestrationController {

    private final ScheduledTaskService scheduledTaskService;

    public OrchestrationController(ScheduledTaskService scheduledTaskService) {
        this.scheduledTaskService = scheduledTaskService;
    }

    /**
     * Run a scheduled task immediately (same semantics as {@code POST /api/platform/scheduled-tasks/{id}/run}).
     * Authenticate with a session cookie or API token owned by the task's user.
     */
    @PostMapping("/trigger")
    public ApiResponse<ScheduledTaskDto> trigger(@RequestBody OrchestrationTriggerRequest request) {
        if (request == null || request.taskId() == null || request.taskId().isBlank()) {
            throw new IllegalArgumentException("taskId is required");
        }
        return ApiResponse.ok(scheduledTaskService.runNow(request.taskId().trim()));
    }

    /**
     * Poll remote DAG/job status for an {@code http_trigger} task
     * ({@code statusUrl} / {@code statusUrlTemplate} in payload).
     */
    @PostMapping("/status")
    public ApiResponse<OrchestrationStatusDto> status(@RequestBody OrchestrationStatusRequest request) {
        if (request == null || request.taskId() == null || request.taskId().isBlank()) {
            throw new IllegalArgumentException("taskId is required");
        }
        return ApiResponse.ok(scheduledTaskService.pollOrchestrationStatus(request.taskId().trim()));
    }
}
