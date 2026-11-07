package org.apache.datawise.backend.schema.introspect.oracle;

import org.apache.datawise.backend.common.DbType;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OracleFamilySchemaMetadataSupportTest {

    @Test
    void supports_usesInjectedMatcher_andPriorityIsDialectSpecific() {
        OracleFamilySchemaMetadataSupport oracle = new OracleFamilySchemaMetadataSupport(DbType.ORACLE::matches);
        OracleFamilySchemaMetadataSupport dm = new OracleFamilySchemaMetadataSupport(DbType::isDmFamily);

        assertTrue(oracle.supports("oracle"));
        assertFalse(oracle.supports("dm"));
        assertTrue(dm.supports("dm"));
        assertFalse(dm.supports("oracle"));
        assertEquals(20, oracle.priority());
        assertEquals(20, dm.priority());
    }

    @Test
    void listViews_delegatesToDictionaryListing() throws Exception {
        OracleFamilySchemaMetadataSupport support = new OracleFamilySchemaMetadataSupport(DbType.ORACLE::matches);
        Connection connection = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.prepareStatement(contains("all_views"))).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString(1)).thenReturn("V1");

        var nodes = support.listViews(connection, "conn-1", null, "hr", "oracle");

        assertEquals(1, nodes.size());
        assertEquals("V1", nodes.get(0).getLabel());
        verify(ps).setString(1, "HR");
    }
}
