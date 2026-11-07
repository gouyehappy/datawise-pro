package org.apache.datawise.backend.server.pack;

import org.apache.datawise.backend.domain.pack.PackConnectorMap;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PackConnectorMapTest {

    @Test
    void freeConnectorsHaveNoPack() {
        assertTrue(PackConnectorMap.isFreeConnector("mysql"));
        assertTrue(PackConnectorMap.isFreeConnector("mariadb"));
        assertTrue(PackConnectorMap.isFreeConnector("postgresql"));
        assertTrue(PackConnectorMap.isFreeConnector("sqlite"));
        assertTrue(PackConnectorMap.isFreeConnector("sqlite3"));
        assertTrue(PackConnectorMap.packIdForConnector("mysql").isEmpty());
        assertTrue(PackConnectorMap.packIdForConnector("mariadb").isEmpty());
        assertTrue(PackConnectorMap.packIdForConnector("postgresql").isEmpty());
        assertTrue(PackConnectorMap.packIdForConnector("sqlite").isEmpty());
        assertTrue(PackConnectorMap.packIdForConnector("sqlite3").isEmpty());
    }

    @Test
    void paidConnectorsMapToCommercialPacks() {
        assertEquals(PackIds.CONNECTOR_ENTERPRISE, PackConnectorMap.packIdForConnector("oracle").orElseThrow());
        assertEquals(PackIds.CONNECTOR_ENTERPRISE, PackConnectorMap.packIdForConnector("h2").orElseThrow());
        assertEquals(PackIds.CONNECTOR_DOMESTIC, PackConnectorMap.packIdForConnector("dm").orElseThrow());
        assertEquals(PackIds.CONNECTOR_BIGDATA, PackConnectorMap.packIdForConnector("kafka").orElseThrow());
    }

    @Test
    void lookupIsCaseInsensitive() {
        assertEquals(PackIds.CONNECTOR_DOMESTIC, PackConnectorMap.packIdForConnector("DM").orElseThrow());
    }
}
