package org.apache.datawise.backend.domain;

public record JoinTeamResultDto(
        String status,
        TeamSummaryDto team,
        String message) {
}
