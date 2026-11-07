package org.apache.datawise.taskconcurrency.core;

import org.apache.datawise.taskconcurrency.config.TaskConcurrencyProperties;
import org.apache.datawise.taskconcurrency.exception.InvalidTaskAdmissionException;
import org.apache.datawise.taskconcurrency.model.TaskAdmissionRequest;
import org.apache.commons.lang3.StringUtils;

/** 入池请求参数校验 */
public final class TaskAdmissionValidator
{
    private TaskAdmissionValidator()
    {
    }

    public static void validate(TaskAdmissionRequest request)
    {
        if (request == null) {
            throw new InvalidTaskAdmissionException("request must not be null");
        }
        if (StringUtils.isBlank(request.getTaskId())) {
            throw new InvalidTaskAdmissionException("taskId must not be blank");
        }
        if (request.getTenantId() <= 0) {
            throw new InvalidTaskAdmissionException("tenantId must be positive");
        }
        int p = request.getPriority();
        if (p < TaskConcurrencyProperties.MIN_PRIORITY || p > TaskConcurrencyProperties.MAX_PRIORITY) {
            throw new InvalidTaskAdmissionException(String.format(
                    "priority must be in [%d, %d]",
                    TaskConcurrencyProperties.MIN_PRIORITY, TaskConcurrencyProperties.MAX_PRIORITY));
        }
    }
}
