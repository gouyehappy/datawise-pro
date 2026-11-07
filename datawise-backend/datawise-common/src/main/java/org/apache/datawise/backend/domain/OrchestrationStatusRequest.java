package org.apache.datawise.backend.domain;

/** Poll remote DAG / job status for an {@code http_trigger} scheduled task. */
public record OrchestrationStatusRequest(String taskId) {
}
