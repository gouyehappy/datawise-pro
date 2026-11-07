package org.apache.datawise.backend.domain;

public record ConnectionTestResult(boolean ok, String message, long latencyMs) {
}
