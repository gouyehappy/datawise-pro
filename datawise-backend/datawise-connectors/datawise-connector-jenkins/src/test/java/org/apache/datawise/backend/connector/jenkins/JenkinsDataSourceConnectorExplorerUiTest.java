package org.apache.datawise.backend.connector.jenkins;

import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class JenkinsDataSourceConnectorExplorerUiTest {

    @Test
    void explorerUiKeepsSingleWorkbenchTreeEntry() {
        JenkinsDataSourceConnector connector = new JenkinsDataSourceConnector(null);
        ConnectorExplorerUiProfileDto profile = connector.explorerUi();
        assertNotNull(profile);
        assertEquals("jenkins", profile.dbType());
        List<ConnectorExplorerFeatureDto> features = profile.features();
        assertEquals(3, features.size());
        assertEquals("workbench", features.get(0).id());
        assertEquals("jenkins-jobs", features.get(0).openKind());
        assertEquals(true, features.get(0).includeInTree());
        assertEquals(false, features.get(0).includeInMenu());
        assertEquals("jobs", features.get(1).id());
        assertEquals(false, features.get(1).includeInTree());
        assertEquals(true, features.get(1).includeInMenu());
        assertEquals("nodes", features.get(2).id());
        assertEquals(false, features.get(2).includeInTree());
    }
}
