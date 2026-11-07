package org.apache.datawise.backend.connector.ssh;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;

import java.util.EnumSet;
import java.util.List;

public class SshDataSourceConnector implements DataSourceConnector {

    private static final EnumSet<ConnectorCapability> CAPABILITIES = EnumSet.of(
            ConnectorCapability.CONNECTION_TEST,
            ConnectorCapability.CATALOG,
            ConnectorCapability.REMOTE_SHELL
    );

    private static final ConnectorExplorerUiProfileDto EXPLORER_UI = new ConnectorExplorerUiProfileDto(
            "ssh",
            List.of(
                    new ConnectorExplorerFeatureDto(
                            "terminal",
                            "ssh-terminal",
                            "ssh-terminal",
                            "open-ssh-terminal",
                            "console",
                            "explorer.sshFeatures.terminal",
                            10,
                            null,
                            null,
                            ":ssh-terminal"
                    ),
                    new ConnectorExplorerFeatureDto(
                            "new-terminal",
                            "ssh-terminal",
                            "ssh-terminal-new",
                            "new-ssh-terminal",
                            "console",
                            "explorer.context.newSshTerminal",
                            15,
                            false,
                            true,
                            null
                    ),
                    new ConnectorExplorerFeatureDto(
                            "script-records",
                            "ssh-script-records",
                            "ssh-script-records",
                            "open-ssh-script-records",
                            "folder",
                            "explorer.sshFeatures.scriptRecords",
                            20,
                            true,
                            false,
                            ":ssh:script-records"
                    )
            )
    );

    private final SshConnectorOperations ssh;

    public SshDataSourceConnector(SshConnectorOperations ssh) {
        this.ssh = ssh;
    }

    @Override
    public String id() {
        return "ssh";
    }

    @Override
    public int priority() {
        return 10;
    }

    @Override
    public boolean supports(String dbType) {
        return dbType != null && "ssh".equalsIgnoreCase(dbType);
    }

    @Override
    public EnumSet<ConnectorCapability> capabilities() {
        return EnumSet.copyOf(CAPABILITIES);
    }

    @Override
    public ConnectorExplorerUiProfileDto explorerUi() {
        return EXPLORER_UI;
    }

    @Override
    public ConnectorConnectionOperations connection() {
        return ssh;
    }

    @Override
    public ConnectorCatalogOperations catalog() {
        return ssh;
    }
}
