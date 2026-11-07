package org.apache.datawise.backend.domain;

import java.util.List;

public record ActiveSessionListDto(
        List<ActiveSessionDto> sessions,
        boolean supported,
        String message) {
}
