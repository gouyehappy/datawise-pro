package org.apache.datawise.backend.common;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DbTypeFamilyTest {

    @Test
    void mysqlFamilyIncludesOceanbase() {
        assertTrue(DbTypeFamily.isMysqlFamily("oceanbase"));
    }

    @Test
    void mysqlProtocolIncludesOlap() {
        assertTrue(DbTypeFamily.isMysqlProtocol("starrocks"));
        assertTrue(DbTypeFamily.isOlapFamily(DbType.DORIS));
    }

    @Test
    void oracleClickhouseAndHiveFamilies() {
        assertTrue(DbTypeFamily.isOracleFamily("oracle"));
        assertTrue(DbTypeFamily.isSchemaRootFamily("oracle"));
        assertTrue(DbTypeFamily.isSchemaRootFamily("dm"));
        assertTrue(DbTypeFamily.isSchemaRootFamily("db2"));
        assertTrue(DbTypeFamily.isClickhouse("clickhouse"));
        assertTrue(DbTypeFamily.isHive("hive"));
    }

    @Test
    void catalogSchemaInstanceKeyIncludesSqlServer() {
        assertTrue(DbTypeFamily.usesCatalogSchemaInstanceKey("sqlserver"));
        assertTrue(DbTypeFamily.usesCatalogSchemaInstanceKey("trino"));
        assertFalse(DbTypeFamily.usesCatalogSchemaInstanceKey("mysql"));
    }

    @Test
    void urlTemplatesExposePatterns() {
        DbTypeUrlTemplates templates = DbType.MYSQL.urlTemplates();
        assertEquals("jdbc:mysql://", templates.getUrlPrefix());
        assertTrue(templates.getSample().contains("jdbc:mysql://"));
    }
}
