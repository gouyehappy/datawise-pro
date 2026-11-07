package org.apache.datawise.backend.ddl;

import java.util.List;

public record DdlTranslateResult(
        List<String> ddls,
        List<String> warnings) {

    public DdlTranslateResult {
        ddls = ddls != null ? List.copyOf(ddls) : List.of();
        warnings = warnings != null ? List.copyOf(warnings) : List.of();
    }
}
