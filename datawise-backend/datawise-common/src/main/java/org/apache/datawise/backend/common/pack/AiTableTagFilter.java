package org.apache.datawise.backend.common.pack;

import java.util.List;

/**
 * Optional table-tag filter for MCP / tooling. Implemented by datawise-ai when present.
 */
public interface AiTableTagFilter {

    List<String> filterTaggedTables(String connectionId, String database, List<String> candidates);
}
