package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.domain.OutboundEvent;
import org.apache.datawise.backend.domain.OutboundWebhookChannels;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
final class IssueWebhookRenderer implements OutboundChannelRenderer {

    @Override
    public boolean supports(String channel) {
        String normalized = OutboundWebhookChannels.normalize(channel);
        return OutboundWebhookChannels.GITHUB_ISSUE.equals(normalized)
                || OutboundWebhookChannels.GITLAB_ISSUE.equals(normalized)
                || OutboundWebhookChannels.JIRA_ISSUE.equals(normalized);
    }

    @Override
    public OutboundPreparedRequest prepare(OutboundChannelRenderContext context) {
        String channel = OutboundWebhookChannels.normalize(context.webhook().getChannel());
        return switch (channel) {
            case OutboundWebhookChannels.GITHUB_ISSUE -> prepareGithub(context);
            case OutboundWebhookChannels.GITLAB_ISSUE -> prepareGitlab(context);
            case OutboundWebhookChannels.JIRA_ISSUE -> prepareJira(context);
            default -> throw new IllegalArgumentException("unsupported issue webhook channel: " + channel);
        };
    }

    private OutboundPreparedRequest prepareGithub(OutboundChannelRenderContext context) {
        OutboundChannelRenderSupport.requireToken(context.webhook().getSecret(), "github_issue");
        OutboundEvent event = context.event();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", OutboundChannelRenderSupport.issueTitle(event));
        body.put("body", OutboundChannelRenderSupport.formatIssueBody(event));
        List<String> labels = OutboundChannelRenderSupport.labelNames(event);
        if (!labels.isEmpty()) {
            body.put("labels", labels);
        }
        return OutboundPreparedRequest.of(
                context.webhook().getUrl(),
                body,
                false,
                Map.of(
                        "Authorization", "Bearer " + context.webhook().getSecret().trim(),
                        "Accept", "application/vnd.github+json",
                        "X-GitHub-Api-Version", "2022-11-28"));
    }

    private OutboundPreparedRequest prepareGitlab(OutboundChannelRenderContext context) {
        OutboundChannelRenderSupport.requireToken(context.webhook().getSecret(), "gitlab_issue");
        OutboundEvent event = context.event();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", OutboundChannelRenderSupport.issueTitle(event));
        body.put("description", OutboundChannelRenderSupport.formatIssueBody(event));
        List<String> labels = OutboundChannelRenderSupport.labelNames(event);
        if (!labels.isEmpty()) {
            body.put("labels", String.join(",", labels));
        }
        return OutboundPreparedRequest.of(
                context.webhook().getUrl(),
                body,
                false,
                Map.of("PRIVATE-TOKEN", context.webhook().getSecret().trim()));
    }

    private OutboundPreparedRequest prepareJira(OutboundChannelRenderContext context) {
        OutboundChannelRenderSupport.requireToken(context.webhook().getSecret(), "jira_issue");
        OutboundEvent event = context.event();
        String projectKey = OutboundChannelRenderSupport.resolveJiraProjectKey(context.webhook().getUrl(), event);
        String plainBody = OutboundChannelRenderSupport.formatIssueBody(event);
        Map<String, Object> textNode = new LinkedHashMap<>();
        textNode.put("type", "text");
        textNode.put("text", plainBody);
        Map<String, Object> paragraph = new LinkedHashMap<>();
        paragraph.put("type", "paragraph");
        paragraph.put("content", List.of(textNode));
        Map<String, Object> description = new LinkedHashMap<>();
        description.put("type", "doc");
        description.put("version", 1);
        description.put("content", List.of(paragraph));
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("project", Map.of("key", projectKey));
        fields.put("summary", OutboundChannelRenderSupport.issueTitle(event));
        fields.put("description", description);
        fields.put("issuetype", Map.of("name", "Task"));
        List<String> labels = OutboundChannelRenderSupport.labelNames(event);
        if (!labels.isEmpty()) {
            fields.put("labels", labels);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("fields", fields);
        return OutboundPreparedRequest.of(
                context.webhook().getUrl(),
                body,
                false,
                Map.of(
                        "Accept", "application/json",
                        "Content-Type", "application/json",
                        "Authorization", OutboundChannelRenderSupport.jiraAuthorization(context.webhook().getSecret().trim())));
    }
}
