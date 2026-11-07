package org.apache.datawise.backend.platform.mcp.confirm;

import org.apache.datawise.backend.security.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConfirmGateServiceTest {

    private ConfirmGateService gate;

    @BeforeEach
    void setUp() {
        gate = new ConfirmGateService();
        gate.clearForTests();
        UserContext.set(9L, false, "session-test", "default");
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void proposeReturnsDwConfirmWireAndListsPending() {
        Map<String, Object> wire = gate.propose(
                "propose_open_console",
                ConfirmTicket.RISK_SESSION,
                "Open SQL console",
                Map.of("sql", "select 1"),
                Map.of("type", "open_console", "sql", "select 1")
        );
        assertEquals(Boolean.TRUE, wire.get("dw_confirm"));
        String ticketId = String.valueOf(wire.get("ticketId"));
        assertTrue(ticketId.startsWith("cft_"));
        assertEquals(1, gate.listPendingForCurrentUser().size());

        ConfirmTicket confirmed = gate.decide(ticketId, "confirm", null);
        assertEquals(ConfirmTicket.STATUS_CONFIRMED, confirmed.status());
        assertEquals("open_console", confirmed.execution().get("type"));
        assertEquals(0, gate.listPendingForCurrentUser().size());
    }

    @Test
    void rejectRemovesFromPending() {
        Map<String, Object> wire = gate.propose(
                "propose_open_console",
                ConfirmTicket.RISK_SESSION,
                "Open",
                Map.of(),
                Map.of("type", "open_console")
        );
        String ticketId = String.valueOf(wire.get("ticketId"));
        ConfirmTicket rejected = gate.decide(ticketId, "reject", "nope");
        assertEquals(ConfirmTicket.STATUS_REJECTED, rejected.status());
        assertEquals(0, gate.listPendingForCurrentUser().size());
    }
}
