package org.apache.datawise.backend.connector.facade.nativecmd;

import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.domain.RedisCommandResultDto;
import org.apache.datawise.backend.domain.RedisKeyDetailDto;
import org.apache.datawise.backend.domain.RedisKeysScanResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

/** Redis 等非 JDBC 原生命令与 KV 能力入口。 */
@Component
public class ConnectorNativeAccess {

    private final ConnectorCatalogAccess catalog;

    public ConnectorNativeAccess(ConnectorCatalogAccess catalog) {
        this.catalog = catalog;
    }

    public RedisKeyDetailDto fetchKeyDetail(ConnectionEntity connection, String key) {
        return catalog.resolve(connection).keyValue().fetchKeyDetail(connection, key);
    }

    public RedisKeysScanResultDto scanKeys(
                                           ConnectionEntity connection,
                                           String pattern,
                                           String cursor,
                                           int count) {
        return catalog.resolve(connection).keyValue().scanKeys(connection, pattern, cursor, count);
    }

    public RedisCommandResultDto executeCommand(ConnectionEntity connection, String command) {
        return catalog.resolve(connection).nativeCommand().executeCommand(connection, command);
    }
}
