package org.apache.datawise.backend.domain;

public record AuthSessionPolicyDto(int ttlMinutes, boolean slidingRenewal) {
}
