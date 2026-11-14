package org.apache.datawise.backend.ai.schema;

import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.security.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 加载并截断表 DDL，供 LLM schema prompt 使用。
 */
@Component
public class AiSchemaDdlLoader {

    private static final Logger log = LoggerFactory.getLogger(AiSchemaDdlLoader.class);

    private final TableDetailService tableDetailService;
    private final AiSchemaCache schemaCache;

    public AiSchemaDdlLoader(TableDetailService tableDetailService, AiSchemaCache schemaCache) {
        this.tableDetailService = tableDetailService;
        this.schemaCache = schemaCache;
    }

    public List<AiTableDdlSnippet> loadSnippets(String connectionId, String database, List<String> tableNames) {
        List<AiTableDdlSnippet> ddls = new ArrayList<>();
        String tenantId = UserContext.getTenantId();
        for (String table : tableNames) {
            try {
                String cacheKey = AiSchemaCache.ddlKey(tenantId, connectionId, database, table);
                AiTableDdlSnippet snippet = schemaCache.getOrLoad(cacheKey, () -> {
                    TableDdlResult ddl = tableDetailService.loadDdl(table, connectionId, database);
                    if (ddl.ddl() == null || ddl.ddl().isBlank()) {
                        return null;
                    }
                    return new AiTableDdlSnippet(table, truncateDdl(ddl.ddl()));
                });
                if (snippet != null) {
                    ddls.add(snippet);
                }
            } catch (RuntimeException ex) {
                ExceptionLogging.recoverable(log, "Skip DDL introspection for table " + table, ex);
            }
        }
        return ddls;
    }

    static String truncateDdl(String ddl) {
        return AiSchemaDdlCompressor.compress(ddl, AiSchemaLimits.MAX_DDL_CHARS, Set.of());
    }

    static String truncateDdl(String ddl, Set<String> preferredColumns) {
        return AiSchemaDdlCompressor.compress(ddl, AiSchemaLimits.MAX_DDL_CHARS, preferredColumns);
    }
}
