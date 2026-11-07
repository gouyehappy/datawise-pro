package org.apache.datawise.backend.domain;

public record TerminalExecRequest(String input, String cwd, String platform) {
}
