package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.domain.TreeNode;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExplorerSchemaFilterTest {

    @Test
    void hasStaleCatalogSchemaChildren_detectsFoldersWithoutSchemasForSqlServer() {
        TreeNode database = new TreeNode();
        database.setType("database");
        database.setLabel("mydb");

        TreeNode tables = new TreeNode();
        tables.setType("folder");
        tables.setLabel("tables");

        assertTrue(ExplorerSchemaFilter.hasStaleCatalogSchemaChildren(
                "sqlserver",
                database,
                List.of(tables)));
    }

    @Test
    void hasStaleCatalogSchemaChildren_ignoresSchemaChildren() {
        TreeNode database = new TreeNode();
        database.setType("database");

        TreeNode schema = new TreeNode();
        schema.setType("schema");
        schema.setLabel("dbo");

        assertFalse(ExplorerSchemaFilter.hasStaleCatalogSchemaChildren(
                "sqlserver",
                database,
                List.of(schema)));
    }

    @Test
    void hasStaleCatalogSchemaChildren_ignoresMysqlFlatCatalog() {
        TreeNode database = new TreeNode();
        database.setType("database");

        TreeNode tables = new TreeNode();
        tables.setType("folder");
        tables.setLabel("tables");

        assertFalse(ExplorerSchemaFilter.hasStaleCatalogSchemaChildren(
                "mysql",
                database,
                List.of(tables)));
    }
}
