package org.apache.datawise.backend.connector.api.support;

import org.apache.datawise.backend.domain.ConnectionGroupDto;
import org.apache.datawise.backend.domain.ConnectionsCatalogDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ConnectionsCatalogMapperTest {

    @Test
    void fromCatalogDedupesDuplicateGroupIdsKeepingLast() {
        ConnectionsCatalogMapper.ParsedEntities parsed = ConnectionsCatalogMapper.fromCatalog(
                new ConnectionsCatalogDto(
                        1,
                        List.of(
                                new ConnectionGroupDto("group-x", "dev", null, 0, true, null, null),
                                new ConnectionGroupDto("group-x", "nosql", null, 1, true, null, null)),
                        List.of()));

        assertEquals(1, parsed.groups().size());
        assertEquals("nosql", parsed.groups().get(0).getLabel());
    }
}
