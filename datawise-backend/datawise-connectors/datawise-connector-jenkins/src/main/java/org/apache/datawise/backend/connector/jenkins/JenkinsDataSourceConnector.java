package org.apache.datawise.backend.connector.jenkins;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorCiCdOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;

import java.util.EnumSet;
import java.util.List;

public class JenkinsDataSourceConnector implements DataSourceConnector {

    private static final EnumSet<ConnectorCapability> CAPABILITIES = EnumSet.of(
            ConnectorCapability.CONNECTION_TEST,
            ConnectorCapability.CATALOG,
            ConnectorCapability.CI_CD
    );

    private static final ConnectorExplorerUiProfileDto EXPLORER_UI = new ConnectorExplorerUiProfileDto(
            "jenkins",
            List.of(
                    new ConnectorExplorerFeatureDto(
                            "workbench",
                            "jenkins-feature",
                            "jenkins-jobs",
                            "open-jenkins-workbench",
                            "tab-jenkins",
                            "explorer.jenkinsFeatures.workbench",
                            5,
                            true,
                            false,
                            null
                    ),
                    new ConnectorExplorerFeatureDto(
                            "jobs",
                            "jenkins-feature",
                            "jenkins-jobs",
                            "open-jenkins-jobs",
                            "tab-jenkins",
                            "explorer.jenkinsFeatures.jobs",
                            10,
                            false,
                            true,
                            null
                    ),
                    new ConnectorExplorerFeatureDto(
                            "nodes",
                            "jenkins-feature",
                            "jenkins-nodes",
                            "open-jenkins-nodes",
                            "cpu",
                            "explorer.jenkinsFeatures.nodes",
                            20,
                            false,
                            true,
                            null
                    )
            )
    );

    private final JenkinsConnectorOperations jenkins;

    public JenkinsDataSourceConnector(JenkinsConnectorOperations jenkins) {
        this.jenkins = jenkins;
    }

    @Override
    public String id() {
        return "jenkins";
    }

    @Override
    public int priority() {
        return 10;
    }

    @Override
    public boolean supports(String dbType) {
        return dbType != null && "jenkins".equalsIgnoreCase(dbType);
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
        return jenkins;
    }

    @Override
    public ConnectorCatalogOperations catalog() {
        return jenkins;
    }

    @Override
    public ConnectorCiCdOperations ciCd() {
        return jenkins;
    }
}
