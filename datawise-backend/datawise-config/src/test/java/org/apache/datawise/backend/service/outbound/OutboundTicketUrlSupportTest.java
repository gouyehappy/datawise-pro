package org.apache.datawise.backend.service.outbound;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class OutboundTicketUrlSupportTest {

    @Test
    void extractsGithubHtmlUrl() {
        assertEquals(
                "https://github.com/acme/repo/issues/12",
                OutboundTicketUrlSupport.extractTicketUrl(
                        "github_issue",
                        "{\"html_url\":\"https://github.com/acme/repo/issues/12\",\"number\":12}"));
    }

    @Test
    void extractsGitlabWebUrl() {
        assertEquals(
                "https://gitlab.com/acme/repo/-/issues/3",
                OutboundTicketUrlSupport.extractTicketUrl(
                        "gitlab_issue",
                        "{\"web_url\":\"https://gitlab.com/acme/repo/-/issues/3\",\"iid\":3}"));
    }

    @Test
    void extractsJiraBrowseUrlFromSelf() {
        assertEquals(
                "https://acme.atlassian.net/browse/DW-9",
                OutboundTicketUrlSupport.extractTicketUrl(
                        "jira_issue",
                        "{\"id\":\"10001\",\"key\":\"DW-9\",\"self\":\"https://acme.atlassian.net/rest/api/3/issue/10001\"}"));
    }

    @Test
    void returnsNullForBlankOrUnknown() {
        assertNull(OutboundTicketUrlSupport.extractTicketUrl("github_issue", ""));
        assertNull(OutboundTicketUrlSupport.extractTicketUrl("webhook", "{\"ok\":true}"));
    }
}
