package org.apache.datawise.backend.connector.redis;

import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RedisDataSourceConnectorExplorerUiTest {

    @Test
    void explorerUiKeepsSingleWorkbenchEntry() {
        RedisDataSourceConnector connector = new RedisDataSourceConnector(null);
        ConnectorExplorerUiProfileDto profile = connector.explorerUi();
        assertNotNull(profile);
        assertEquals("redis", profile.dbType());
        List<ConnectorExplorerFeatureDto> features = profile.features();
        assertEquals(1, features.size());
        assertEquals("workbench", features.get(0).id());
        assertEquals("open-redis-workbench", features.get(0).menuId());
        assertTrue(features.get(0).includeInTree());
        assertTrue(features.get(0).includeInMenu());
    }
}
