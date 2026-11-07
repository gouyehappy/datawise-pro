package org.apache.datawise.backend.common.pack;

/**
 * SPI for AI entitlement checks. Implemented in the server module so {@code datawise-ai}
 * controllers do not depend on server package types (enables without-ai packaging).
 */
public interface AiAccessGate {

    /**
     * @return {@code true} if pack.ai is usable (apply tenant AI quota);
     *         {@code false} if a free Standard call was consumed.
     */
    boolean requireAiCallAccess();

    /** Settings / RAG / knowledge — require full AI pack (no free allowance). */
    void requireAiPack();

    /** Remaining free calls, or {@code -1} when entitled / open mode. */
    int freeAiCallsRemaining();
}
