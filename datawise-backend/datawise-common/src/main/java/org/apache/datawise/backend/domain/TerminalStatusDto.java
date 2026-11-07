package org.apache.datawise.backend.domain;

public record TerminalStatusDto(
        boolean websocketEnabled,
        boolean ptyAvailable,
        String websocketPath) {
}
