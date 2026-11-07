package org.apache.datawise.backend.domain;

import java.util.List;

public record OutboundEventDefinitionDto(
        String type,
        String displayNameZh,
        String displayNameEn,
        String defaultTitleTemplate,
        String defaultBodyTemplate,
        List<String> supportedChannels,
        List<OutboundEventVariableDto> variables,
        boolean recommended,
        boolean supportsMentions) {
}
