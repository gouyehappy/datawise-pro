package org.apache.datawise.backend.domain;

import java.util.List;

public record DatasourceDefinitionDto(
        String id,
        String label,
        boolean primary,
        String defaultPort,
        boolean jdbcDriverRequired,
        String defaultDriverMaven,
        String defaultDriverClass,
        List<String> capabilities,
        String identifierQuote) {
}
