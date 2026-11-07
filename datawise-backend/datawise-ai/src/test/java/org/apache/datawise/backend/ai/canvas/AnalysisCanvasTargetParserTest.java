package org.apache.datawise.backend.ai.canvas;

import org.apache.datawise.backend.ai.domain.AiDatabaseTargetDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AnalysisCanvasTargetParserTest {

    @Test
    void parseResolvesConnectionAndDatabaseFromCompositeId() {
        String json = """
                [
                  {
                    "id": "conn-1:sales_db:orders",
                    "connectionLabel": "MySQL",
                    "databaseLabel": "sales_db",
                    "tableLabel": "orders",
                    "dbType": "mysql",
                    "level": "table"
                  }
                ]
                """;

        List<AiDatabaseTargetDto> targets = AnalysisCanvasTargetParser.parse(json);

        assertEquals(1, targets.size());
        assertEquals("conn-1", targets.get(0).connectionId());
        assertEquals("sales_db", targets.get(0).database());
        assertEquals("orders", targets.get(0).tableLabel());
    }

    @Test
    void parseReturnsEmptyForBlankInput() {
        assertTrue(AnalysisCanvasTargetParser.parse(null).isEmpty());
        assertTrue(AnalysisCanvasTargetParser.parse("  ").isEmpty());
    }
}
