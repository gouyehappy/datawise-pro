package org.apache.datawise.backend.config;

import org.junit.jupiter.api.Test;

import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class JdbcPoolPropertiesTest {

    @Test
    void applyPagedReadFetchSize_usesProbeRowCountWhenDefaultEqualsBatchSize() throws Exception {
        JdbcPoolProperties properties = new JdbcPoolProperties();
        properties.setDefaultFetchSize(500);
        Statement statement = mock(Statement.class);

        properties.applyPagedReadFetchSize(statement, 500);

        verify(statement).setFetchSize(501);
    }

    @Test
    void applyPagedReadFetchSize_keepsLargerConfiguredFetchSize() throws Exception {
        JdbcPoolProperties properties = new JdbcPoolProperties();
        properties.setDefaultFetchSize(2000);
        Statement statement = mock(Statement.class);

        properties.applyPagedReadFetchSize(statement, 500);

        verify(statement).setFetchSize(2000);
    }

    @Test
    void applyPagedReadFetchSize_whenDefaultZero_usesProbeRows() throws Exception {
        JdbcPoolProperties properties = new JdbcPoolProperties();
        properties.setDefaultFetchSize(0);
        Statement statement = mock(Statement.class);

        properties.applyPagedReadFetchSize(statement, 500);

        verify(statement).setFetchSize(501);
    }
}
