package org.apache.datawise.backend.connector.kafka;

import org.apache.datawise.backend.domain.TreeNode;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

class KafkaConnectorOperationsTest {

    @Test
    void loadConnectionRoot_returnsEmptyLikeRedis() {
        KafkaConnectorOperations operations = new KafkaConnectorOperations();
        List<TreeNode> nodes = operations.loadConnectionRoot(null, "*");
        assertTrue(nodes.isEmpty());
    }
}
