package org.apache.datawise.backend.domain;

import java.util.Map;

/** Manual Insight → ticket / runbook export request. */
public record CreateInsightActionRequest(
        String title,
        String body,
        Map<String, Object> data) {
}
