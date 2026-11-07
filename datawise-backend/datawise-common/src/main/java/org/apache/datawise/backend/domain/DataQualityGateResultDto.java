package org.apache.datawise.backend.domain;

import java.util.List;

public record DataQualityGateResultDto(
        boolean passed,
        int total,
        int failed,
        List<DataQualityRuleRunDto> results,
        /** Present when a reference (multi-env) scope was evaluated; otherwise null. */
        List<DataQualityGateScopeResultDto> scopes,
        /** Present when multi-env name pairing was used; otherwise null. */
        List<DataQualityGatePairDto> pairs) {
}
