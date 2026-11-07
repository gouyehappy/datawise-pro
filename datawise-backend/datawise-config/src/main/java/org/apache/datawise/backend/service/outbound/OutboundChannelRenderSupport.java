package org.apache.datawise.backend.service.outbound;

import org.apache.datawise.backend.domain.OutboundEvent;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;

final class OutboundChannelRenderSupport {

    static final String MAIL_WEBHOOK_ENV = "DATAWISE_MAIL_WEBHOOK_URL";
    private static final int MAX_ISSUE_TITLE = 240;
    private static volatile Function<String, String> envLookup = System::getenv;

    private OutboundChannelRenderSupport() {
    }

    static void setEnvLookupForTests(Function<String, String> lookup) {
        envLookup = lookup != null ? lookup : System::getenv;
    }

    static String appendDingtalkMentions(String text, OutboundWebhookResolvedSubscription subscription) {
        if (subscription == null) {
            return text;
        }
        boolean hasAny = subscription.mentionAll()
                || !subscription.mentionMobiles().isEmpty()
                || !subscription.mentionUserIds().isEmpty();
        if (!hasAny) {
            return text;
        }
        StringBuilder sb = new StringBuilder(text != null ? text : "");
        sb.append("\n\n");
        if (subscription.mentionAll()) {
            sb.append("@所有人 ");
        }
        for (String mobile : subscription.mentionMobiles()) {
            sb.append('@').append(mobile).append(' ');
        }
        for (String userId : subscription.mentionUserIds()) {
            sb.append('@').append(userId).append(' ');
        }
        return sb.toString().trim();
    }

    static String appendFeishuMentions(String text, OutboundWebhookResolvedSubscription subscription) {
        if (subscription == null) {
            return text;
        }
        boolean hasAny = subscription.mentionAll()
                || !subscription.mentionMobiles().isEmpty()
                || !subscription.mentionUserIds().isEmpty();
        if (!hasAny) {
            return text;
        }
        StringBuilder sb = new StringBuilder(text != null ? text : "");
        sb.append('\n');
        if (subscription.mentionAll()) {
            sb.append("<at user_id=\"all\">所有人</at> ");
        }
        for (String userId : subscription.mentionUserIds()) {
            sb.append("<at user_id=\"").append(userId).append("\"></at> ");
        }
        for (String mobile : subscription.mentionMobiles()) {
            sb.append('@').append(mobile).append(' ');
        }
        return sb.toString().trim();
    }

    static String formatIssueBody(OutboundEvent event) {
        StringBuilder sb = new StringBuilder();
        sb.append("_Opened by DataWise insight / ops export_\n\n");
        if (event.type() != null && !event.type().isBlank()) {
            sb.append("**Event:** `").append(event.type()).append("`\n\n");
        }
        if (event.id() != null && !event.id().isBlank()) {
            sb.append("**Delivery id:** `").append(event.id()).append("`\n\n");
        }
        if (event.body() != null && !event.body().isBlank()) {
            sb.append(event.body().trim()).append("\n\n");
        }
        Map<String, Object> data = event.data();
        if (data != null && !data.isEmpty()) {
            sb.append("### Details\n\n");
            for (Map.Entry<String, Object> entry : data.entrySet()) {
                if (entry.getKey() == null || entry.getValue() == null || "labels".equalsIgnoreCase(entry.getKey())) {
                    continue;
                }
                String value = String.valueOf(entry.getValue()).trim();
                if (value.isEmpty()) {
                    continue;
                }
                if (value.length() > 800) {
                    value = value.substring(0, 797) + "...";
                }
                sb.append("- **").append(entry.getKey()).append(":** ").append(value).append('\n');
            }
            sb.append('\n');
        }
        sb.append("---\n");
        sb.append("Suggested next step: attach a runbook, open a follow-up PR, or link the owning Query Library item.\n");
        return sb.toString().trim();
    }

    static String issueTitle(OutboundEvent event) {
        String raw;
        if (event.title() != null && !event.title().isBlank()) {
            raw = event.title().trim();
        } else if (event.type() != null && !event.type().isBlank()) {
            raw = event.type().trim();
        } else {
            raw = "DataWise event";
        }
        Map<String, Object> data = event.data();
        if (data != null) {
            Object name = data.get("name");
            if (name != null && !String.valueOf(name).isBlank()) {
                raw = raw + ": " + name;
            }
        }
        if (raw.length() <= MAX_ISSUE_TITLE) {
            return raw;
        }
        return raw.substring(0, MAX_ISSUE_TITLE - 1) + "…";
    }

    static String formatPlainText(OutboundEvent event) {
        StringBuilder sb = new StringBuilder();
        if (event.title() != null && !event.title().isBlank()) {
            sb.append(event.title());
        } else {
            sb.append('[').append(event.type() != null ? event.type() : "event").append(']');
        }
        if (event.body() != null && !event.body().isBlank()) {
            sb.append('\n').append(event.body());
        }
        Map<String, Object> data = event.data();
        if (data != null && !data.isEmpty()) {
            Object name = data.get("name");
            if (name != null && !String.valueOf(name).isBlank()) {
                sb.append("\n名称：").append(name);
            }
            Object webhookName = data.get("webhookName");
            if (webhookName != null && !String.valueOf(webhookName).isBlank()) {
                sb.append("\nWebhook：").append(webhookName);
            }
            Object message = data.get("message");
            if (message != null && !String.valueOf(message).isBlank()) {
                sb.append("\n详情：").append(message);
            }
        }
        sb.append("\n— 来自 DataWise");
        return sb.toString().trim();
    }

    static String formatMarkdown(OutboundEvent event) {
        StringBuilder sb = new StringBuilder();
        String title = event.title() != null && !event.title().isBlank() ? event.title() : event.type();
        sb.append("#### ").append(title).append("\n\n");
        if (event.type() != null && !event.type().isBlank()) {
            sb.append("> **事件类型：** ").append(event.type()).append("  \n");
        }
        if (event.body() != null && !event.body().isBlank()) {
            sb.append("> ").append(event.body()).append("  \n");
        }
        Map<String, Object> data = event.data();
        if (data != null) {
            Object name = data.get("name");
            if (name != null && !String.valueOf(name).isBlank()) {
                sb.append("> **名称：** ").append(name).append("  \n");
            }
            Object message = data.get("message");
            if (message != null && !String.valueOf(message).isBlank()) {
                sb.append("> **详情：** ").append(message).append("  \n");
            }
        }
        sb.append("\n<font color=\"#999999\">来自 DataWise</font>");
        return sb.toString().trim();
    }

    static List<String> labelNames(OutboundEvent event) {
        if (event == null || event.data() == null) {
            return List.of();
        }
        Object labels = event.data().get("labels");
        if (!(labels instanceof Collection<?> collection) || collection.isEmpty()) {
            return List.of();
        }
        List<String> labelNames = new ArrayList<>();
        for (Object item : collection) {
            if (item != null && !String.valueOf(item).isBlank()) {
                labelNames.add(String.valueOf(item).trim());
            }
        }
        return List.copyOf(labelNames);
    }

    static String resolveJiraProjectKey(String url, OutboundEvent event) {
        String fromUrl = firstNonBlank(queryParam(url, "project"), queryParam(url, "projectKey"));
        if (fromUrl != null) {
            return fromUrl;
        }
        if (event != null && event.data() != null) {
            Object projectKey = event.data().get("projectKey");
            if (projectKey == null) {
                projectKey = event.data().get("jiraProject");
            }
            if (projectKey != null && !String.valueOf(projectKey).isBlank()) {
                return String.valueOf(projectKey).trim();
            }
        }
        throw new IllegalArgumentException(
                "jira_issue requires project key (?project=KEY or ?projectKey=KEY on webhook URL, "
                        + "or data.projectKey / data.jiraProject on the event)");
    }

    static String jiraAuthorization(String secret) {
        if (secret.contains(":")) {
            String encoded = Base64.getEncoder().encodeToString(secret.getBytes(StandardCharsets.UTF_8));
            return "Basic " + encoded;
        }
        return "Bearer " + secret;
    }

    static void requireToken(String secret, String channel) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalArgumentException(channel + " requires a personal access token in secret");
        }
    }

    static String feishuSign(long timestampSec, String secret) {
        try {
            String stringToSign = timestampSec + "\n" + secret;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] signData = mac.doFinal(stringToSign.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(signData);
        } catch (Exception ex) {
            throw new IllegalStateException("feishu sign failed", ex);
        }
    }

    static String dingtalkSign(long timestampMs, String secret) {
        try {
            String stringToSign = timestampMs + "\n" + secret;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] signData = mac.doFinal(stringToSign.getBytes(StandardCharsets.UTF_8));
            return URLEncoder.encode(Base64.getEncoder().encodeToString(signData), StandardCharsets.UTF_8);
        } catch (Exception ex) {
            throw new IllegalStateException("dingtalk sign failed", ex);
        }
    }

    static String appendQuery(String url, String key, String value) {
        String encodedKey = URLEncoder.encode(key, StandardCharsets.UTF_8);
        String encodedValue = value != null ? value : "";
        if (!"sign".equals(key)) {
            encodedValue = URLEncoder.encode(encodedValue, StandardCharsets.UTF_8);
        }
        if (url.contains("?")) {
            return url + "&" + encodedKey + "=" + encodedValue;
        }
        return url + "?" + encodedKey + "=" + encodedValue;
    }

    static EmailTarget resolveEmailTarget(String url, String secret, OutboundEvent event) {
        String trimmed = url != null ? url.trim() : "";
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("email channel requires a url (mailto:, recipient, or http gateway)");
        }
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (lower.startsWith("mailto:")) {
            String to = trimmed.substring("mailto:".length()).split("[?&]", 2)[0].trim();
            return new EmailTarget(requireMailWebhookUrl(), requireRecipient(to), apiKeyIfPresent(secret));
        }
        if (looksLikeEmail(trimmed) && !lower.startsWith("http://") && !lower.startsWith("https://")) {
            return new EmailTarget(requireMailWebhookUrl(), trimmed, apiKeyIfPresent(secret));
        }
        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            String to = firstNonBlank(emailFromSecret(secret), emailFromEvent(event), queryParam(trimmed, "to"));
            return new EmailTarget(trimmed, requireRecipient(to), apiKeyIfNotEmail(secret));
        }
        throw new IllegalArgumentException(
                "email channel url must be mailto:addr, a recipient address, or an http(s) mail gateway");
    }

    private static String requireMailWebhookUrl() {
        String gateway = envLookup.apply(MAIL_WEBHOOK_ENV);
        if (gateway == null || gateway.isBlank()) {
            throw new IllegalArgumentException(
                    "email channel with mailto:/address URL requires " + MAIL_WEBHOOK_ENV
                            + " (HTTP mail gateway that accepts JSON {to,subject,text})");
        }
        String trimmed = gateway.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            throw new IllegalArgumentException(MAIL_WEBHOOK_ENV + " must be an http(s) URL");
        }
        return trimmed;
    }

    private static String requireRecipient(String to) {
        if (to == null || to.isBlank() || !looksLikeEmail(to)) {
            throw new IllegalArgumentException(
                    "email channel requires a recipient (mailto:, bare address, secret=to@…, or data.emailTo)");
        }
        return to.trim();
    }

    private static boolean looksLikeEmail(String value) {
        if (value == null) {
            return false;
        }
        String trimmed = value.trim();
        int at = trimmed.indexOf('@');
        return at > 0 && at < trimmed.length() - 1 && !trimmed.contains(" ") && !trimmed.contains("/");
    }

    private static String emailFromSecret(String secret) {
        if (secret != null && looksLikeEmail(secret)) {
            return secret.trim();
        }
        return null;
    }

    private static String apiKeyIfPresent(String secret) {
        if (secret == null || secret.isBlank() || looksLikeEmail(secret)) {
            return null;
        }
        return secret.trim();
    }

    private static String apiKeyIfNotEmail(String secret) {
        return apiKeyIfPresent(secret);
    }

    private static String emailFromEvent(OutboundEvent event) {
        if (event == null || event.data() == null) {
            return null;
        }
        Object value = event.data().get("emailTo");
        if (value == null) {
            value = event.data().get("to");
        }
        return value != null ? String.valueOf(value).trim() : null;
    }

    private static String queryParam(String url, String key) {
        int q = url.indexOf('?');
        if (q < 0 || q >= url.length() - 1) {
            return null;
        }
        String query = url.substring(q + 1);
        for (String part : query.split("&")) {
            String[] kv = part.split("=", 2);
            if (kv.length == 2 && key.equalsIgnoreCase(kv[0].trim())) {
                return URLDecoder.decode(kv[1].trim(), StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    record EmailTarget(String postUrl, String to, String apiKey) {
    }
}
