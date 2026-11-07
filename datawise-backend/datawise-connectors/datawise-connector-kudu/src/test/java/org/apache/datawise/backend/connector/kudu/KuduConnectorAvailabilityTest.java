package org.apache.datawise.backend.connector.kudu;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.ConnectorRegistry;
import org.apache.datawise.backend.kudu.KuduClientFactory;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KuduConnectorAvailabilityTest {

    @Test
    void catalogProfileIsUsable() {
        assertTrue(DbType.KUDU.isCatalogListed());
        assertEquals("Kudu", DbType.KUDU.getDisplayName());
        assertEquals(7051, DbType.KUDU.getPort());
        assertEquals("", DbType.KUDU.getDriver());
        assertEquals("", DbType.KUDU.getUrlPrefix());
        assertFalse(DbType.KUDU.catalogEntry().orElseThrow().jdbcDriverRequired());
    }

    @Test
    void registryResolvesKudu() {
        KuduDataSourceConnector connector = new KuduDataSourceConnector(new KuduConnectorOperations());
        assertEquals("kudu", connector.id());
        assertTrue(connector.supports("kudu"));
        assertTrue(connector.capabilities().contains(ConnectorCapability.DOCUMENT_READ));
        assertFalse(connector.capabilities().contains(ConnectorCapability.SQL_EXECUTE));

        ConnectorRegistry registry = new ConnectorRegistry(List.of(connector));
        assertEquals("kudu", registry.resolve("kudu").id());
    }

    @Test
    void resolvesMasterAddressesFromHostPort() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("10.0.0.1");
        entity.setPort("7051");
        assertEquals("10.0.0.1:7051", KuduClientFactory.resolveMasters(entity));
    }

    @Test
    void resolvesMultipleMastersFromHostField() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("master1:7051,master2:7051,master3:7051");
        assertEquals("master1:7051,master2:7051,master3:7051", KuduClientFactory.resolveMasters(entity));
    }
}
