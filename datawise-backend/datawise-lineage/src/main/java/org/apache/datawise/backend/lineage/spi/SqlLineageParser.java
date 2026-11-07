package org.apache.datawise.backend.lineage.spi;

import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageParseResult;

/** SQL → 血缘 IR，与具体 AST 引擎无关。 */
public interface SqlLineageParser {

    boolean supports(String dbType);

    default int priority() {
        return 100;
    }

    String engineId();

    String engineVersion();

    LineageParseResult parse(LineageParseRequest request);
}
