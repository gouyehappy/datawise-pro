package org.apache.datawise.backend.ai.schema;

import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiSchemaDdlLoaderTest {

    @Mock
    private TableDetailService tableDetailService;

    @InjectMocks
    private AiSchemaDdlLoader ddlLoader;

    @Test
    void loadSnippets_skipsBlankAndTruncatesLongDdl() {
        String longBody = "c".repeat(AiSchemaLimits.MAX_DDL_CHARS + 50);
        when(tableDetailService.loadDdl(eq("orders"), eq("conn-1"), eq("db1")))
                .thenReturn(new TableDdlResult("CREATE TABLE orders (id INT)"));
        when(tableDetailService.loadDdl(eq("empty"), eq("conn-1"), eq("db1")))
                .thenReturn(new TableDdlResult("  "));
        when(tableDetailService.loadDdl(eq("wide"), eq("conn-1"), eq("db1")))
                .thenReturn(new TableDdlResult(longBody));

        List<AiTableDdlSnippet> snippets = ddlLoader.loadSnippets("conn-1", "db1", List.of("orders", "empty", "wide"));

        assertEquals(2, snippets.size());
        assertEquals("orders", snippets.get(0).table());
        assertTrue(snippets.get(1).ddl().endsWith("\n-- ... truncated"));
        verify(tableDetailService).loadDdl("orders", "conn-1", "db1");
    }

    @Test
    void truncateDdl_keepsShortDdlUntouched() {
        assertEquals("CREATE TABLE t (id INT)", AiSchemaDdlLoader.truncateDdl("  CREATE TABLE t (id INT)  "));
    }
}
