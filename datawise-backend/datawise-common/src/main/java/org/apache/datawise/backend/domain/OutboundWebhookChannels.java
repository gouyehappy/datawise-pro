package org.apache.datawise.backend.domain;

/** Outbound notification channel kinds for tenant webhooks. */
public final class OutboundWebhookChannels {

    public static final String WEBHOOK = "webhook";
    public static final String FEISHU = "feishu";
    public static final String DINGTALK = "dingtalk";
    /**
     * Email via HTTP mail gateway.
     * <p>
     * URL may be {@code mailto:ops@acme.com} / bare address (posts to {@code DATAWISE_MAIL_WEBHOOK_URL}),
     * or an {@code http(s)} gateway URL with recipient in secret / {@code data.emailTo}.
     */
    public static final String EMAIL = "email";
    /** Create a GitHub Issue via Issues API (Insight / DQ / task failures → ticket). */
    public static final String GITHUB_ISSUE = "github_issue";
    /** Create a GitLab Issue via Issues API. */
    public static final String GITLAB_ISSUE = "gitlab_issue";
    /** Create a Jira Cloud Issue via REST API v3. */
    public static final String JIRA_ISSUE = "jira_issue";

    private OutboundWebhookChannels() {
    }

    public static String normalize(String channel) {
        if (channel == null || channel.isBlank()) {
            return WEBHOOK;
        }
        String value = channel.trim().toLowerCase();
        return switch (value) {
            case FEISHU, "lark" -> FEISHU;
            case DINGTALK, "ding" -> DINGTALK;
            case EMAIL, "mail", "smtp" -> EMAIL;
            case GITHUB_ISSUE, "github", "gh_issue" -> GITHUB_ISSUE;
            case GITLAB_ISSUE, "gitlab", "gl_issue" -> GITLAB_ISSUE;
            case JIRA_ISSUE, "jira" -> JIRA_ISSUE;
            case WEBHOOK, "generic", "http" -> WEBHOOK;
            default -> throw new IllegalArgumentException("unsupported outbound channel: " + channel);
        };
    }
}
