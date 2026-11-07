package org.apache.datawise.backend.domain;

import java.util.List;

public record TeamSharedQueryPresenceEvent(
        String teamId,
        String queryId,
        List<TeamSharedQueryViewerDto> viewers) {

    public TeamSharedQueryPresenceEvent {
        viewers = viewers != null ? List.copyOf(viewers) : List.of();
    }
}
