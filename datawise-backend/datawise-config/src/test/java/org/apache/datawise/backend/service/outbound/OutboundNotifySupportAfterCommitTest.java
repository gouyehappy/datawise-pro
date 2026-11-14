package org.apache.datawise.backend.service.outbound;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;

class OutboundNotifySupportAfterCommitTest {

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void runsImmediatelyWithoutTransaction() {
        AtomicInteger count = new AtomicInteger();
        OutboundNotifySupport.runAfterCommitOrNow(count::incrementAndGet);
        assertEquals(1, count.get());
    }

    @Test
    void defersUntilAfterCommitWhenSynchronizationActive() {
        TransactionSynchronizationManager.initSynchronization();
        AtomicInteger count = new AtomicInteger();
        OutboundNotifySupport.runAfterCommitOrNow(count::incrementAndGet);
        assertEquals(0, count.get());

        TransactionSynchronizationManager.getSynchronizations().forEach(sync -> sync.afterCommit());
        assertEquals(1, count.get());
    }
}
