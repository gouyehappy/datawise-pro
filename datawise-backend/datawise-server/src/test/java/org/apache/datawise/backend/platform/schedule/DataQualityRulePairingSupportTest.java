package org.apache.datawise.backend.platform.schedule;

import org.apache.datawise.backend.model.ScheduledTaskEntry;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DataQualityRulePairingSupportTest {

    @Test
    void plansPairsPreferringBlockingDuplicateNames() {
        ScheduledTaskEntry soft = rule("r-soft", "No nulls", false);
        ScheduledTaskEntry hard = rule("r-hard", "No nulls", true);
        ScheduledTaskEntry other = rule("r-other", "Other", true);

        var plan = DataQualityRulePairingSupport.plan(
                List.of("p1", "p2"),
                List.of("No nulls", "Missing"),
                List.of(soft, hard, other)
        );

        assertEquals(2, plan.pairs().size());
        assertTrue(plan.pairs().get(0).paired());
        assertEquals("r-hard", plan.pairs().get(0).referenceRuleId());
        assertFalse(plan.pairs().get(1).paired());
        assertEquals(List.of("r-hard"), plan.matchedReferenceRuleIds());
        assertEquals(List.of("Missing"), plan.unpairedPrimaryNames());
    }

    private static ScheduledTaskEntry rule(String id, String name, boolean blocking) {
        ScheduledTaskEntry entry = new ScheduledTaskEntry();
        entry.setId(id);
        entry.setName(name);
        entry.setType(ScheduledTaskEntry.TYPE_DATA_QUALITY);
        entry.setPayloadJson("{\"blocking\":" + blocking + "}");
        return entry;
    }
}
