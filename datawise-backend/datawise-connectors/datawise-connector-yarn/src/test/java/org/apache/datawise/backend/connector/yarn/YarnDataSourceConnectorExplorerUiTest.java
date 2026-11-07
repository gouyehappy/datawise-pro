package org.apache.datawise.backend.connector.yarn;

import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class YarnDataSourceConnectorExplorerUiTest {

    @Test
    void explorerUiKeepsSingleWorkbenchTreeEntry() {
        YarnDataSourceConnector connector = new YarnDataSourceConnector(null);
        ConnectorExplorerUiProfileDto profile = connector.explorerUi();
        assertNotNull(profile);
        assertEquals("yarn", profile.dbType());
        List<ConnectorExplorerFeatureDto> features = profile.features();
        assertEquals(4, features.size());
        assertEquals("workbench", features.get(0).id());
        assertEquals("yarn-applications", features.get(0).openKind());
        assertEquals(true, features.get(0).includeInTree());
        assertEquals(false, features.get(0).includeInMenu());
        assertEquals("applications", features.get(1).id());
        assertEquals(false, features.get(1).includeInTree());
        assertEquals(true, features.get(1).includeInMenu());
        assertEquals("nodes", features.get(2).id());
        assertEquals(false, features.get(2).includeInTree());
        assertEquals("queues", features.get(3).id());
        assertEquals(false, features.get(3).includeInTree());
    }
}
