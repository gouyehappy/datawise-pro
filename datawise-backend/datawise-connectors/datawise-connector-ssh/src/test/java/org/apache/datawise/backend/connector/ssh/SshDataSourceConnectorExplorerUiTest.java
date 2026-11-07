package org.apache.datawise.backend.connector.ssh;

import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SshDataSourceConnectorExplorerUiTest {

    @Test
    void explorerUiDeclaresTerminalMenuOnlyNewAndScriptRecords() {
        SshDataSourceConnector connector = new SshDataSourceConnector(null);
        ConnectorExplorerUiProfileDto profile = connector.explorerUi();
        assertNotNull(profile);
        assertEquals("ssh", profile.dbType());
        List<ConnectorExplorerFeatureDto> features = profile.features();
        assertEquals(3, features.size());

        ConnectorExplorerFeatureDto terminal = features.get(0);
        assertEquals("terminal", terminal.id());
        assertEquals(":ssh-terminal", terminal.treeNodeIdSuffix());
        assertTrue(terminal.includeInTree());
        assertTrue(terminal.includeInMenu());

        ConnectorExplorerFeatureDto neu = features.get(1);
        assertEquals("new-terminal", neu.id());
        assertEquals("new-ssh-terminal", neu.menuId());
        assertFalse(neu.includeInTree());
        assertTrue(neu.includeInMenu());

        ConnectorExplorerFeatureDto scripts = features.get(2);
        assertEquals("script-records", scripts.id());
        assertEquals(":ssh:script-records", scripts.treeNodeIdSuffix());
        assertTrue(scripts.includeInTree());
        assertFalse(scripts.includeInMenu());
    }
}
