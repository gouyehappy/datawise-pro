package org.apache.datawise.backend.ddl;

import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.connector.starrocks.ddl.StarRocksDdlRenderer;
import org.apache.datawise.backend.ddl.parser.DefaultLogicalTypeParser;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CrossDialectStarRocksDdlTranslatorTest {

    private final CrossDialectDdlTranslator translator = new CrossDialectDdlTranslator(
            new DialectDdlRendererRegistry(
                    List.of(new StarRocksDdlRenderer()),
                    new ConnectorPluginContributionHolder()
            ),
            new CrossDialectLogicalTypeNormalizer(),
            new LogicalTypeParserRegistry(
                    List.of(new DefaultLogicalTypeParser()),
                    new ConnectorPluginContributionHolder()
            )
    );

    @Test
    void generatesOlapCreateTableFromMysqlSource() {
        TablePropertiesResult source = new TablePropertiesResult(
                "cdp_tag",
                "CDP标签表",
                "InnoDB",
                "utf8mb4",
                "utf8mb4_general_ci",
                "1",
                List.of(
                        new TableColumnDetail(1, "id", "bigint(20)", false, true, "PRI", null, "auto_increment", "主键ID"),
                        new TableColumnDetail(2, "tag_name", "varchar(100)", false, false, null, null, null, "标签名称"),
                        new TableColumnDetail(3, "user_count", "int(11)", true, false, null, "0", null, "用户数量"),
                        new TableColumnDetail(4, "status", "tinyint(4)", true, false, null, "1", null, "状态")
                ),
                List.of(),
                List.of()
        );

        CrossDialectDdlTranslator.CrossDialectDdlPreview preview = translator.preview(
                source,
                "mysql",
                "starrocks",
                "a003",
                "shop"
        );

        assertNotNull(preview.suggestedCreateDdl());
        String ddl = preview.suggestedCreateDdl();
        assertTrue(ddl.contains("ENGINE=OLAP"), () -> ddl);
        assertTrue(ddl.contains("DUPLICATE KEY(`id`)"), () -> ddl);
        assertTrue(ddl.contains("DISTRIBUTED BY HASH(`id`)"), () -> ddl);
        assertTrue(!ddl.contains("PRIMARY KEY"), () -> ddl);
        assertTrue(!ddl.contains("DEFAULT 0"), () -> ddl);
        assertTrue(ddl.contains("DEFAULT '0'"), () -> ddl);
        assertTrue(ddl.contains("DEFAULT '1'"), () -> ddl);
        assertTrue(ddl.contains("COMMENT \"CDP标签表\""), () -> ddl);
        assertTrue(ddl.indexOf("ENGINE=OLAP") < ddl.indexOf("COMMENT \"CDP标签表\""), () -> ddl);
    }
}
