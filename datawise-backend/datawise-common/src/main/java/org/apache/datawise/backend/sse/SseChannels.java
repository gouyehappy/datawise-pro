package org.apache.datawise.backend.sse;

/** Well-known SSE bus channel name helpers. */
public final class SseChannels {

    public static final String MIGRATION_JOB_PREFIX = "migration-job:";
    public static final String TEAM_QUERY_PREFIX = "team-query:";

    private SseChannels() {
    }

    public static String migrationJob(String jobId) {
        return MIGRATION_JOB_PREFIX + jobId.trim();
    }

    public static String teamQuery(String teamId, String queryId) {
        return TEAM_QUERY_PREFIX + teamId.trim() + ":" + queryId.trim();
    }

    public static String migrationJobId(String channel) {
        if (channel == null || !channel.startsWith(MIGRATION_JOB_PREFIX)) {
            return null;
        }
        String jobId = channel.substring(MIGRATION_JOB_PREFIX.length()).trim();
        return jobId.isEmpty() ? null : jobId;
    }

    public static String[] teamQueryParts(String channel) {
        if (channel == null || !channel.startsWith(TEAM_QUERY_PREFIX)) {
            return null;
        }
        String rest = channel.substring(TEAM_QUERY_PREFIX.length());
        int sep = rest.indexOf(':');
        if (sep <= 0 || sep >= rest.length() - 1) {
            return null;
        }
        return new String[]{rest.substring(0, sep), rest.substring(sep + 1)};
    }
}
