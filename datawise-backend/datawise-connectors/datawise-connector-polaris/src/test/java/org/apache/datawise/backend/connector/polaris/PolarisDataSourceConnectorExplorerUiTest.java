package org.apache.datawise.backend.connector.polaris;

import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class PolarisDataSourceConnectorExplorerUiTest {

    @Test
    void explorerUiDeclaresServicesThenConfigs() {
        PolarisDataSourceConnector connector = new PolarisDataSourceConnector(null);
        ConnectorExplorerUiProfileDto profile = connector.explorerUi();
        assertNotNull(profile);
        assertEquals("polaris", profile.dbType());
        List<ConnectorExplorerFeatureDto> features = profile.features();
        assertEquals(2, features.size());
        assertEquals("services", features.get(0).id());
        assertEquals("polaris-services", features.get(0).openKind());
        assertEquals("configs", features.get(1).id());
        assertEquals("polaris-configs", features.get(1).openKind());
        assertEquals(false, features.get(0).includeInTree());
        assertEquals(true, features.get(0).includeInMenu());
        assertEquals(false, features.get(1).includeInTree());
        assertEquals(true, features.get(1).includeInMenu());
    }
}
