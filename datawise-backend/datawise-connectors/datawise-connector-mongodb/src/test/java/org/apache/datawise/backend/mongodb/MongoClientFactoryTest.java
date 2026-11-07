package org.apache.datawise.backend.mongodb;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MongoClientFactoryTest {

    @Test
    void buildConnectionString_withoutAuth() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("127.0.0.1");
        entity.setPort("27017");
        entity.setDatabaseName("test");

        assertEquals("mongodb://127.0.0.1:27017/test", MongoClientFactory.buildConnectionString(entity));
    }

    @Test
    void buildConnectionString_withAuthAndAuthSource() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setHost("127.0.0.1");
        entity.setPort("27017");
        entity.setDatabaseName("admin");
        entity.setUsername("root");
        entity.setPassword("secret");

        assertEquals(
                "mongodb://root:secret@127.0.0.1:27017/admin?authSource=admin",
                MongoClientFactory.buildConnectionString(entity)
        );
    }

    @Test
    void normalizeConnectionString_stripsJdbcPrefix() {
        assertEquals(
                "mongodb://127.0.0.1:27017/admin",
                MongoClientFactory.normalizeConnectionString("jdbc:mongodb://127.0.0.1:27017/admin")
        );
    }

    @Test
    void readAdvancedProperty_readsAuthSource() {
        String advanced = """
                authSource=admin
                replicaSet=rs0
                """;
        assertEquals("admin", MongoClientFactory.readAdvancedProperty(advanced, "authSource"));
    }

    @Test
    void resolveConnectionString_mergesCredentialsWhenUrlHasNoUserInfo() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setJdbcUrl("mongodb://192.0.2.70:27018/");
        entity.setHost("192.0.2.70");
        entity.setPort("27018");
        entity.setUsername("admin");
        entity.setPassword("secret");

        assertEquals(
                "mongodb://admin:secret@192.0.2.70:27018?authSource=admin",
                MongoClientFactory.resolveConnectionString(entity)
        );
    }

    @Test
    void resolveConnectionString_keepsUrlWithEmbeddedCredentials() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setJdbcUrl("mongodb://admin:secret@192.0.2.70:27018/admin?authSource=admin");
        entity.setUsername("ignored");
        entity.setPassword("ignored");

        assertEquals(
                "mongodb://admin:secret@192.0.2.70:27018/admin?authSource=admin",
                MongoClientFactory.resolveConnectionString(entity)
        );
    }
}
