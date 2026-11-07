package org.apache.datawise.backend.domain;

import java.util.List;
import java.util.Map;

public record TerminalExecResult(List<Map<String, String>> lines, String cwd) {
}
