package org.apache.datawise.backend.connector.spi;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ConnectorDialectContributionsTest {

    @Test
    void builderProducesSameStructureAsConstructor() {
        ConnectorDialectContributions fromConstructor = new ConnectorDialectContributions(
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of());

        ConnectorDialectContributions fromBuilder = ConnectorDialectContributions.builder().build();

        assertEquals(fromConstructor, fromBuilder);
        assertEquals(ConnectorDialectContributions.EMPTY, fromBuilder);
    }
}
