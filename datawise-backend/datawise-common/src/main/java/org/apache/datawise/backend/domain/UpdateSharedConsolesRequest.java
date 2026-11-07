package org.apache.datawise.backend.domain;

import java.util.List;

public record UpdateSharedConsolesRequest(List<String> consoleIds) {
}
