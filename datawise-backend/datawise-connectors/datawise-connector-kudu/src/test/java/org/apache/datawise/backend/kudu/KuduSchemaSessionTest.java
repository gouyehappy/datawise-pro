package org.apache.datawise.backend.kudu;

import org.apache.datawise.backend.connector.kudu.support.KuduConnectionSupport;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KuduSchemaSessionTest {

    @Test
    void introspectConnectionExposesDefaultDatabase() throws Exception {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-kudu");

        List<TreeNode> roots = new KuduSchemaSession(entity).introspectConnection();

        assertEquals(1, roots.size());
        assertEquals("database", roots.get(0).getType());
        assertEquals(KuduConnectionSupport.DEFAULT_CATALOG, roots.get(0).getLabel());
        assertTrue(roots.get(0).getChildren() != null && !roots.get(0).getChildren().isEmpty());
    }
}
