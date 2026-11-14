package org.apache.datawise.backend.controller.platform;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.SaveScheduledTaskRequest;
import org.apache.datawise.backend.domain.ScheduledTaskDto;
import org.apache.datawise.backend.platform.schedule.ScheduledTaskService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import java.util.List;

import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresFeature;

@RestController
@RequestMapping("/api/platform/scheduled-tasks")
@RequiresFeature(UserFeaturePermission.SETTINGS_DATA_AGENT)
public class ScheduledTaskController {

    private final ScheduledTaskService scheduledTaskService;

    public ScheduledTaskController(ScheduledTaskService scheduledTaskService) {
        this.scheduledTaskService = scheduledTaskService;
    }

    @GetMapping
    public ApiResponse<List<ScheduledTaskDto>> list() {
        return ApiResponse.ok(scheduledTaskService.list());
    }

    @PutMapping
    public ApiResponse<ScheduledTaskDto> save(@Valid @RequestBody SaveScheduledTaskRequest request) {
        return ApiResponse.ok(scheduledTaskService.save(request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable String id) {
        scheduledTaskService.delete(id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/run")
    public ApiResponse<ScheduledTaskDto> runNow(@PathVariable String id) {
        return ApiResponse.ok(scheduledTaskService.runNow(id));
    }
}
