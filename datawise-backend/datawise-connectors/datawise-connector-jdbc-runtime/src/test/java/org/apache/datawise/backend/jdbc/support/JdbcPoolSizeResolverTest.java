package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.config.JdbcPoolProperties;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class JdbcPoolSizeResolverTest {

    @Test
    void capsMaximumPoolSizeOverride() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setAdvancedConfig("jdbc.maximumPoolSize=200");

        int resolved = JdbcPoolSizeResolver.resolveMaximumPoolSize(entity, new JdbcPoolProperties());

        assertEquals(JdbcPoolSizeResolver.MAXIMUM_POOL_SIZE_CAP, resolved);
    }

    @Test
    void capsDefaultMaximumPoolSize() {
        JdbcPoolProperties defaults = new JdbcPoolProperties();
        defaults.setMaximumPoolSize(100);

        int resolved = JdbcPoolSizeResolver.resolveMaximumPoolSize(new ConnectionEntity(), defaults);

        assertEquals(JdbcPoolSizeResolver.MAXIMUM_POOL_SIZE_CAP, resolved);
    }
}
