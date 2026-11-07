package org.apache.datawise.backend.common.pack;

/**
 * Optional scheduled backup runner. Implemented when datawise-backup is on the classpath.
 */
public interface BackupScheduleRunner {

    /**
     * Start a backup run for the given policy under the schedule trigger.
     *
     * @return short status message for the scheduled-task log
     */
    String runScheduledPolicy(String policyId) throws Exception;
}
