package org.apache.datawise.backend.common.pack;

import org.apache.datawise.backend.domain.SemanticMetricDto;

import java.util.List;

/**
 * Optional semantic-metric listing for MCP / tooling. Implemented by datawise-ai when present.
 */
public interface SemanticMetricQuery {

    List<SemanticMetricDto> list(String connectionId, String database);
}
