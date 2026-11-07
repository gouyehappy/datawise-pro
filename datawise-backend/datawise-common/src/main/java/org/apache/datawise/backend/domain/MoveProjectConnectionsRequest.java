package org.apache.datawise.backend.domain;

import java.util.List;

/** 批量将连接移动到目标项目。 */
public record MoveProjectConnectionsRequest(
        List<String> connectionIds,
        String targetProjectId) {
}
