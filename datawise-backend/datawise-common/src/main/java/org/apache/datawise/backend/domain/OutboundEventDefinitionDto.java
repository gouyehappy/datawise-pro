package org.apache.datawise.backend.domain;

import java.util.List;

public record OutboundEventDefinitionDto(
        String type,
        String category,
        String displayNameZh,
        String displayNameEn,
        String defaultTitleTemplate,
        String defaultBodyTemplate,
        List<String> supportedChannels,
        List<OutboundEventVariableDto> variables,
        boolean recommended,
        boolean supportsMentions) {

    /** Backward-compatible constructor when category is unavailable. */
    public OutboundEventDefinitionDto(
            String type,
            String displayNameZh,
            String displayNameEn,
            String defaultTitleTemplate,
            String defaultBodyTemplate,
            List<String> supportedChannels,
            List<OutboundEventVariableDto> variables,
            boolean recommended,
            boolean supportsMentions
    ) {
        this(
                type,
                OutboundEventCategory.of(type),
                displayNameZh,
                displayNameEn,
                defaultTitleTemplate,
                defaultBodyTemplate,
                supportedChannels,
                variables,
                recommended,
                supportsMentions
        );
    }
}
