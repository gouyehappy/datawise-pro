package org.apache.datawise.backend.domain;

import java.util.List;
import java.util.Map;

public record TeamSummaryDto(
        String id,
        String name,
        int memberCount,
        String role,
        List<String> sharedConnectionIds,
        Map<String, String> sharedConnectionAccess,
        List<String> onCallConnectionIds,
        List<String> sharedConsoleIds,
        boolean shareSqlHistory,
        boolean requireInviteApproval,
        String inviteCode,
        int pendingInviteCount,
        List<String> visibleProjectIds) {
}
