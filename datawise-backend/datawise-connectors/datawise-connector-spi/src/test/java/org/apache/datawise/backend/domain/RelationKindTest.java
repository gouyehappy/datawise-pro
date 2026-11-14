package org.apache.datawise.backend.domain;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RelationKindTest {

    @Test
    void parseRecognizesTriggerViewAndRoutines() {
        assertEquals(RelationKind.TRIGGER, RelationKind.parse("trigger"));
        assertEquals(RelationKind.TRIGGER, RelationKind.parse("TRIGGER"));
        assertEquals(RelationKind.VIEW, RelationKind.parse("view"));
        assertEquals(RelationKind.FUNCTION, RelationKind.parse("function"));
        assertEquals(RelationKind.PROCEDURE, RelationKind.parse("proc"));
        assertEquals(RelationKind.SEQUENCE, RelationKind.parse("sequence"));
        assertEquals(RelationKind.SEQUENCE, RelationKind.parse("seq"));
        assertEquals(RelationKind.TABLE, RelationKind.parse(null));
        assertEquals(RelationKind.TABLE, RelationKind.parse("table"));
        assertEquals("trigger", RelationKind.TRIGGER.queryValue());
        assertEquals("function", RelationKind.FUNCTION.queryValue());
        assertEquals(true, RelationKind.PROCEDURE.isRoutine());
    }
}
