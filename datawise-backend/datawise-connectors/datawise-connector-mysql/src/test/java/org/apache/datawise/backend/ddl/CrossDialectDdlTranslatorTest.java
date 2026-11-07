package org.apache.datawise.backend.ddl;

import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.connector.mysql.ddl.MysqlDdlRenderer;
import org.apache.datawise.backend.connector.postgresql.ddl.PostgresqlDdlRenderer;
import org.apache.datawise.backend.connector.postgresql.parser.PostgresqlLogicalTypeParser;
import org.apache.datawise.backend.ddl.parser.DefaultLogicalTypeParser;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CrossDialectDdlTranslatorTest {

    private final ConnectorPluginContributionHolder contributionHolder = new ConnectorPluginContributionHolder();

    private final CrossDialectDdlTranslator translator = new CrossDialectDdlTranslator(
            new DialectDdlRendererRegistry(
                    List.of(new MysqlDdlRenderer(), new PostgresqlDdlRenderer()),
                    contributionHolder
            ),
            new CrossDialectLogicalTypeNormalizer(),
            new LogicalTypeParserRegistry(
                    List.of(new DefaultLogicalTypeParser(), new PostgresqlLogicalTypeParser()),
                    contributionHolder
            )
    );

    @Test
    void generatesPostgresqlCreateTableFromMysqlSource() {
        TablePropertiesResult source = sampleOrdersTable();

        CrossDialectDdlTranslator.CrossDialectDdlPreview preview = translator.preview(
                source,
                "mysql",
                "postgresql",
                "app_db",
                "shop"
        );

        assertEquals(3, preview.columnMappings().size());
        assertEquals("bigint(20)", preview.columnMappings().get(0).sourceType());
        assertEquals("bigint", preview.columnMappings().get(0).targetType());
        assertNotNull(preview.suggestedCreateDdl());
        assertTrue(preview.suggestedCreateDdl().toLowerCase().contains("create table"));
        assertTrue(preview.suggestedCreateDdl().contains("updated_at"));
    }

    @Test
    void warnsWhenEnumIsDowngraded() {
        TablePropertiesResult source = new TablePropertiesResult(
                "tags",
                null,
                null,
                null,
                null,
                null,
                List.of(new TableColumnDetail(1, "kind", "enum('a','b')", true, false, null, null, null, null)),
                List.of(),
                List.of()
        );

        CrossDialectDdlTranslator.CrossDialectDdlPreview preview = translator.preview(
                source,
                "mysql",
                "postgresql",
                "app_db",
                "shop"
        );

        assertEquals("text", preview.columnMappings().get(0).targetType());
        assertTrue(preview.warnings().contains("enumSetDowngraded"));
    }

    @Test
    void generatesMysqlCreateTableFromStarRocksLongVarchar() {
        TablePropertiesResult source = new TablePropertiesResult(
                "pos_check_discounts",
                null,
                null,
                null,
                null,
                null,
                List.of(new TableColumnDetail(
                        1,
                        "cdis_bday_id",
                        "varchar(65533)",
                        true,
                        false,
                        null,
                        null,
                        null,
                        null
                )),
                List.of(),
                List.of()
        );

        CrossDialectDdlTranslator.CrossDialectDdlPreview preview = translator.preview(
                source,
                "starrocks",
                "mysql",
                "datawise",
                "a003"
        );

        assertNotNull(preview.suggestedCreateDdl());
        assertTrue(preview.suggestedCreateDdl().contains("`cdis_bday_id` mediumtext"));
        assertTrue(!preview.suggestedCreateDdl().contains("varchar(65533)"));
        assertEquals("mediumtext", preview.columnMappings().get(0).targetType());
    }

    private static TablePropertiesResult sampleOrdersTable() {
        return new TablePropertiesResult(
                "orders",
                "order table",
                "InnoDB",
                "utf8mb4",
                "utf8mb4_general_ci",
                "1",
                List.of(
                        new TableColumnDetail(1, "id", "bigint(20)", false, true, "PRI", null, "auto_increment", null),
                        new TableColumnDetail(2, "status", "varchar(32)", false, false, null, "open", null, null),
                        new TableColumnDetail(3, "updated_at", "datetime", true, false, null, null, null, null)
                ),
                List.of(),
                List.of()
        );
    }
}
