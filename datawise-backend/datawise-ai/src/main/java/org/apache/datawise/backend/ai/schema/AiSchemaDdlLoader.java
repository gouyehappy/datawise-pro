package org.apache.datawise.backend.ai.schema;

import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 加载并截断表 DDL，供 LLM schema prompt 使用。
 */
@Component
public class AiSchemaDdlLoader {

    private static final Logger log = LoggerFactory.getLogger(AiSchemaDdlLoader.class);

    private final TableDetailService tableDetailService;

    public AiSchemaDdlLoader(TableDetailService tableDetailService) {
        this.tableDetailService = tableDetailService;
    }

    public List<AiTableDdlSnippet> loadSnippets(String connectionId, String database, List<String> tableNames) {
        List<AiTableDdlSnippet> ddls = new ArrayList<>();
        for (String table : tableNames) {
            try {
                TableDdlResult ddl = tableDetailService.loadDdl(table, connectionId, database);
                if (ddl.ddl() != null && !ddl.ddl().isBlank()) {
                    ddls.add(new AiTableDdlSnippet(table, truncateDdl(ddl.ddl())));
                }
            } catch (RuntimeException ex) {
                ExceptionLogging.recoverable(log, "Skip DDL introspection for table " + table, ex);
            }
        }
        return ddls;
    }

    static String truncateDdl(String ddl) {
        String trimmed = ddl.trim();
        if (trimmed.length() <= AiSchemaLimits.MAX_DDL_CHARS) {
            return trimmed;
        }
        return trimmed.substring(0, AiSchemaLimits.MAX_DDL_CHARS) + "\n-- ... truncated";
    }
}
