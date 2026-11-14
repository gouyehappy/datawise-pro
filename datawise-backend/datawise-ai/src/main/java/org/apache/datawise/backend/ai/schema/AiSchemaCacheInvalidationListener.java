package org.apache.datawise.backend.ai.schema;

import org.apache.datawise.backend.event.SchemaStructureChangedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Invalidate AI schema cache after successful DDL so the next build reloads JDBC metadata.
 * <p>MetaForge B2：优先 {@link TransactionPhase#AFTER_COMMIT}，无事务时 {@code fallbackExecution}
 * 仍立即执行，避免回滚后误清缓存。
 */
@Component
public class AiSchemaCacheInvalidationListener {

    private static final Logger log = LoggerFactory.getLogger(AiSchemaCacheInvalidationListener.class);

    private final AiSchemaContextService schemaContextService;

    public AiSchemaCacheInvalidationListener(AiSchemaContextService schemaContextService) {
        this.schemaContextService = schemaContextService;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onSchemaStructureChanged(SchemaStructureChangedEvent event) {
        if (event == null || event.connectionId() == null || event.connectionId().isBlank()) {
            return;
        }
        schemaContextService.invalidateSchemaCache(event.connectionId());
        log.debug(
                "ai.schema.cache.invalidated connectionId={} database={} table={}",
                event.connectionId(),
                event.database(),
                event.tableName()
        );
    }
}
