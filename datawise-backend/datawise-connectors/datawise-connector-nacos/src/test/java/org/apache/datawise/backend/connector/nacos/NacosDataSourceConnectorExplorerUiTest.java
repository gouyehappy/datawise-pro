package org.apache.datawise.backend.connector.nacos;

import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class NacosDataSourceConnectorExplorerUiTest {

    @Test
    void explorerUiDeclaresConfigsThenServices() {
        NacosDataSourceConnector connector = new NacosDataSourceConnector(null);
        ConnectorExplorerUiProfileDto profile = connector.explorerUi();
        assertNotNull(profile);
        assertEquals("nacos", profile.dbType());
        List<ConnectorExplorerFeatureDto> features = profile.features();
        assertEquals(2, features.size());
        assertEquals("configs", features.get(0).id());
        assertEquals("nacos-configs", features.get(0).openKind());
        assertEquals("open-nacos-configs", features.get(0).menuId());
        assertEquals("services", features.get(1).id());
        assertEquals("nacos-services", features.get(1).openKind());
        assertEquals(false, features.get(0).includeInTree());
        assertEquals(true, features.get(0).includeInMenu());
    }
}
