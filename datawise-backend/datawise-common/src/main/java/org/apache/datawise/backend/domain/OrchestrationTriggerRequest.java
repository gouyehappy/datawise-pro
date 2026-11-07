package org.apache.datawise.backend.domain;

/**
 * Trigger a DataWise scheduled task from an external orchestrator (Airflow / dbt / Flink, etc.).
 */
public record OrchestrationTriggerRequest(String taskId) {
}
