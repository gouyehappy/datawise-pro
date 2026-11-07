package org.apache.datawise.backend.connector.operation;

import org.apache.datawise.backend.domain.RedisCommandResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;

public interface ConnectorNativeCommandOperations {

    RedisCommandResultDto executeCommand(ConnectionEntity connection, String commandLine);
}
