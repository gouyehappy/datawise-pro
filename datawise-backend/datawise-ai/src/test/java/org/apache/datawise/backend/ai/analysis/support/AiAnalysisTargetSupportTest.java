package org.apache.datawise.backend.ai.analysis.support;

import org.apache.datawise.backend.ai.domain.AiDatabaseTargetDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiAnalysisTargetSupportTest {

    @Test
    void uniqueByConnectionDatabaseKeepsOneEntryPerDatabase() {
        List<AiDatabaseTargetDto> unique = AiAnalysisTargetSupport.uniqueByConnectionDatabase(List.of(
                new AiDatabaseTargetDto("c1", "MySQL@host", "aaflinktest", "aaflinktest", "orders", "mysql"),
                new AiDatabaseTargetDto("c1", "MySQL@host", "aaflinktest", "aaflinktest", "users", "mysql"),
                new AiDatabaseTargetDto("c1", "MySQL@host", "aaflinktest", "aaflinktest", "order_detail", "mysql"),
                new AiDatabaseTargetDto("c2", "PG@host", "sales", "sales", "fact", "postgresql")
        ));

        assertEquals(2, unique.size());
        assertEquals("c1", unique.get(0).connectionId());
        assertEquals("aaflinktest", unique.get(0).database());
        assertEquals("orders", unique.get(0).tableLabel());
        assertEquals("c2", unique.get(1).connectionId());
    }

    @Test
    void formatSourceLabelUsesConnectionAndDatabase() {
        assertEquals(
                "MySQL@host/aaflinktest",
                AiAnalysisTargetSupport.formatSourceLabel(
                        new AiDatabaseTargetDto("c1", "MySQL@host", "aaflinktest", "aaflinktest", "t", "mysql")
                )
        );
    }
}
