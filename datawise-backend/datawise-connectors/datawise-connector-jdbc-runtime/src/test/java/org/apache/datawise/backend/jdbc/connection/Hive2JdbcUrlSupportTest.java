package org.apache.datawise.backend.jdbc.connection;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class Hive2JdbcUrlSupportTest {

    @Test
    void hiveUsesAuthLdap() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("hive");
        entity.setUsername("hive");
        entity.setPassword("secret");

        String url = Hive2JdbcUrlSupport.buildUrl(entity, "127.0.0.1", 10000);

        assertEquals("jdbc:hive2://127.0.0.1:10000/;auth=LDAP", url);
    }

    @Test
    void mergesSslFromAdvancedConfig() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("hive");
        entity.setUsername("hive");
        entity.setPassword("secret");
        entity.setAdvancedConfig("ssl=true");

        String url = Hive2JdbcUrlSupport.buildUrl(entity, "127.0.0.1", 10000);

        assertEquals("jdbc:hive2://127.0.0.1:10000/;auth=LDAP;ssl=true", url);
    }
}
