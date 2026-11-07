package org.apache.datawise.backend.connector.operation;

import org.apache.datawise.backend.domain.RedisKeyDetailDto;
import org.apache.datawise.backend.domain.RedisKeysScanResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

public interface ConnectorKeyValueOperations {

    RedisKeyDetailDto fetchKeyDetail(ConnectionEntity connection, String key);

    RedisKeysScanResultDto scanKeys(ConnectionEntity connection, String pattern, String cursor, int count);
}
