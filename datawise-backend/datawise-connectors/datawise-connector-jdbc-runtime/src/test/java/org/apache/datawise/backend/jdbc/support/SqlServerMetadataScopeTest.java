package org.apache.datawise.backend.jdbc.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlServerMetadataScopeTest {

    @Test
    void parse_buildsInstanceKeyAndQualifiedName() {
        SqlServerMetadataScope scope = SqlServerMetadataScope.parse("mydb.dbo");
        assertEquals("mydb", scope.catalog());
        assertEquals("dbo", scope.schema());
        assertEquals("mydb.dbo", scope.instanceKey());
        assertEquals("[mydb].[dbo].[demo3]", scope.qualifyObject("demo3"));
        assertEquals("mydb.dbo.demo3", scope.qualifiedLabel("demo3"));
    }

    @Test
    void qualifyObject_defaultsSchemaToDboWhenMissing() {
        SqlServerMetadataScope scope = SqlServerMetadataScope.parse("mydb");
        assertTrue(scope.hasCatalog());
        assertEquals("[mydb].[dbo].[orders]", scope.qualifyObject("orders"));
    }
}
