package org.apache.datawise.backend.connector.facade.ddl;

import org.apache.datawise.backend.ddl.CrossDialectDdlTranslator;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.springframework.stereotype.Component;

/** 跨方言 DDL 翻译与 CREATE TABLE 渲染入口。 */
@Component
public class ConnectorDdlAccess {

    private final CrossDialectDdlTranslator crossDialectDdlTranslator;

    public ConnectorDdlAccess(CrossDialectDdlTranslator crossDialectDdlTranslator) {
        this.crossDialectDdlTranslator = crossDialectDdlTranslator;
    }

    public CrossDialectDdlTranslator.CrossDialectDdlPreview preview(
                                                                    TablePropertiesResult sourceProperties,
                                                                    String sourceDbType,
                                                                    String targetDbType,
                                                                    String targetDatabase,
                                                                    String sourceDatabase) {
        return crossDialectDdlTranslator.preview(
                sourceProperties,
                sourceDbType,
                targetDbType,
                targetDatabase,
                sourceDatabase);
    }

    public String renderCreateDdl(
                                  TablePropertiesResult sourceProperties,
                                  String sourceDbType,
                                  String targetDbType,
                                  String targetDatabase,
                                  String sourceDatabase) {
        return crossDialectDdlTranslator.renderCreateDdl(
                sourceProperties,
                sourceDbType,
                targetDbType,
                targetDatabase,
                sourceDatabase);
    }
}
