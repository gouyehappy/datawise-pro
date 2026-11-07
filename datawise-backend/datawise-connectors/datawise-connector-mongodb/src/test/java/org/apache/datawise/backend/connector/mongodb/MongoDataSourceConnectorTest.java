package org.apache.datawise.backend.connector.mongodb;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.junit.jupiter.api.Test;

import java.util.EnumSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MongoDataSourceConnectorTest {

    @Test
    void supportsOnlyMongoDbType() {
        MongoDataSourceConnector connector = new MongoDataSourceConnector(new MongoConnectorOperations());
        assertEquals("mongodb", connector.id());
        assertTrue(connector.supports("mongodb"));
        assertTrue(connector.supports("MongoDB"));
        assertFalse(connector.supports("mysql"));
        assertFalse(connector.supports("redis"));
    }

    @Test
    void exposesDocumentReadCapability() {
        MongoDataSourceConnector connector = new MongoDataSourceConnector(new MongoConnectorOperations());
        assertTrue(connector.capabilities().contains(ConnectorCapability.DOCUMENT_READ));
        assertTrue(connector.capabilities().contains(ConnectorCapability.CATALOG));
        assertEquals(
                EnumSet.of(
                        ConnectorCapability.CONNECTION_TEST,
                        ConnectorCapability.CATALOG,
                        ConnectorCapability.DOCUMENT_READ
                ),
                connector.capabilities()
        );
    }
}
