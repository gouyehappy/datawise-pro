package org.apache.datawise.backend.schema.introspect.oracle;

import org.apache.datawise.backend.domain.TreeNode;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Locks Explorer dictionary owner rules: schema → catalog → empty (no connection fallback). */
class OracleFamilyDictionaryListingTest {

    @Test
    void resolveOwner_prefersSchemaOverCatalog_andUppercases() {
        assertEquals("SCOTT", OracleFamilyDictionaryListing.resolveOwner("hr", "scott"));
        assertEquals("HR", OracleFamilyDictionaryListing.resolveOwner("hr", null));
        assertEquals("HR", OracleFamilyDictionaryListing.resolveOwner("hr", "  "));
        assertEquals("", OracleFamilyDictionaryListing.resolveOwner(null, null));
        assertEquals("", OracleFamilyDictionaryListing.resolveOwner("  ", ""));
    }

    @Test
    void listViews_returnsEmptyWithoutQueryWhenOwnerMissing() throws SQLException {
        Connection connection = mock(Connection.class);

        List<TreeNode> views = OracleFamilyDictionaryListing.listViews(connection, "conn-1", null, null);

        assertTrue(views.isEmpty());
        verify(connection, never()).prepareStatement(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void listViews_bindsUppercasedSchemaOwner() throws SQLException {
        Connection connection = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.prepareStatement(contains("all_views"))).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString(1)).thenReturn("EMP_V");

        List<TreeNode> views = OracleFamilyDictionaryListing.listViews(connection, "conn-1", "ignored", "hr");

        assertEquals(1, views.size());
        assertEquals("view", views.get(0).getType());
        assertEquals("EMP_V", views.get(0).getLabel());
        verify(ps).setString(1, "HR");
    }

    @Test
    void listViews_fallsBackToCatalogWhenSchemaBlank() throws SQLException {
        Connection connection = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.prepareStatement(contains("all_views"))).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(false);

        OracleFamilyDictionaryListing.listViews(connection, "conn-1", "scott", null);

        verify(ps).setString(1, "SCOTT");
    }

    @Test
    void listFunctions_bindsOwnerLikeViews() throws SQLException {
        Connection connection = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.prepareStatement(contains("all_objects"))).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString(1)).thenReturn("F1");

        List<TreeNode> nodes = OracleFamilyDictionaryListing.listFunctions(connection, "conn-1", null, "hr");

        assertEquals(1, nodes.size());
        assertEquals("function", nodes.get(0).getType());
        verify(ps).setString(1, "HR");
    }
}
