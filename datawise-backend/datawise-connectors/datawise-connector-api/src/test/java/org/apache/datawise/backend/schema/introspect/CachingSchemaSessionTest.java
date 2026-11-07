package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.connector.catalog.SchemaSession;
import org.apache.datawise.backend.domain.TreeNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.sql.SQLException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CachingSchemaSessionTest {

    @Mock
    private SchemaSession delegate;

    @Test
    void loadTableList_cachesRepeatedCatalogReads() throws SQLException {
        CachingSchemaSession session = new CachingSchemaSession(delegate);
        List<TreeNode> tables = List.of(tree("users"));
        when(delegate.loadTableList("shop")).thenReturn(tables);

        assertSame(tables, session.loadTableList("shop"));
        assertSame(tables, session.loadTableList("shop"));

        verify(delegate, times(1)).loadTableList("shop");
    }

    @Test
    void loadColumnChildren_usesSeparateCacheEntriesPerTable() throws SQLException {
        CachingSchemaSession session = new CachingSchemaSession(delegate);
        List<TreeNode> userColumns = List.of(tree("id"));
        List<TreeNode> orderColumns = List.of(tree("order_id"));
        when(delegate.loadColumnChildren("shop", "users")).thenReturn(userColumns);
        when(delegate.loadColumnChildren("shop", "orders")).thenReturn(orderColumns);

        assertEquals(userColumns, session.loadColumnChildren("shop", "users"));
        assertEquals(orderColumns, session.loadColumnChildren("shop", "orders"));
        assertSame(userColumns, session.loadColumnChildren("shop", "users"));

        verify(delegate, times(1)).loadColumnChildren("shop", "users");
        verify(delegate, times(1)).loadColumnChildren("shop", "orders");
    }

    private static TreeNode tree(String label) {
        TreeNode node = new TreeNode();
        node.setLabel(label);
        node.setType("column");
        return node;
    }
}
