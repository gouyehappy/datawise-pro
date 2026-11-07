package org.apache.datawise.backend.connector.kafka;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.operation.ConnectorCatalogOperations;
import org.apache.datawise.backend.connector.operation.ConnectorConnectionOperations;
import org.apache.datawise.backend.connector.operation.ConnectorMessageBrokerOperations;
import org.apache.datawise.backend.domain.ConnectorExplorerFeatureDto;
import org.apache.datawise.backend.domain.ConnectorExplorerUiProfileDto;

import java.util.EnumSet;
import java.util.List;

public class KafkaDataSourceConnector implements DataSourceConnector {

    private static final EnumSet<ConnectorCapability> CAPABILITIES = EnumSet.of(
            ConnectorCapability.CONNECTION_TEST,
            ConnectorCapability.CATALOG,
            ConnectorCapability.MESSAGE_BROKER
    );

    private static final ConnectorExplorerUiProfileDto EXPLORER_UI = new ConnectorExplorerUiProfileDto(
            "kafka",
            List.of(
                    new ConnectorExplorerFeatureDto(
                            "workbench",
                            "kafka-feature",
                            "kafka-topics",
                            "open-kafka-workbench",
                            "tab-kafka",
                            "explorer.kafkaFeatures.workbench",
                            5,
                            true,
                            false,
                            null
                    ),
                    new ConnectorExplorerFeatureDto(
                            "topics",
                            "kafka-feature",
                            "kafka-topics",
                            "open-kafka-topics",
                            "tab-kafka",
                            "explorer.kafkaFeatures.topics",
                            10,
                            false,
                            true,
                            null
                    ),
                    new ConnectorExplorerFeatureDto(
                            "consumer-groups",
                            "kafka-feature",
                            "kafka-consumer-groups",
                            "open-kafka-consumer-groups",
                            "users",
                            "explorer.kafkaFeatures.consumerGroups",
                            20,
                            false,
                            true,
                            null
                    ),
                    new ConnectorExplorerFeatureDto(
                            "table-publish",
                            "kafka-feature",
                            "kafka-table-publish",
                            "publish-table-data",
                            "export",
                            "explorer.kafkaFeatures.tablePublish",
                            30
                    )
            )
    );

    private final KafkaConnectorOperations kafka;

    public KafkaDataSourceConnector(KafkaConnectorOperations kafka) {
        this.kafka = kafka;
    }

    @Override
    public String id() {
        return "kafka";
    }

    @Override
    public int priority() {
        return 10;
    }

    @Override
    public boolean supports(String dbType) {
        return dbType != null && "kafka".equalsIgnoreCase(dbType);
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
        return kafka;
    }

    @Override
    public ConnectorCatalogOperations catalog() {
        return kafka;
    }

    @Override
    public ConnectorMessageBrokerOperations messageBroker() {
        return kafka;
    }
}
