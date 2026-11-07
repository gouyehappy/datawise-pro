package org.apache.datawise.backend.domain;

import java.util.List;

public record LockWaitListDto(
        List<LockWaitEdgeDto> edges,
        boolean supported,
        String message) {
}
