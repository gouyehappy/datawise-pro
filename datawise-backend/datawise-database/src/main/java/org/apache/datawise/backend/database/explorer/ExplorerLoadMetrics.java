package org.apache.datawise.backend.database.explorer;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.apache.datawise.backend.common.support.DatawiseMetricsCatalog;
import org.springframework.stereotype.Component;

/** Micrometer counters for explorer loadChildren cache outcomes. */
@Component
public class ExplorerLoadMetrics {

    private final Counter notModifiedShortCircuit;
    private final Counter notModifiedAfterLoad;
    private final Counter modified;

    public ExplorerLoadMetrics(MeterRegistry registry) {
        this.notModifiedShortCircuit = Counter.builder(DatawiseMetricsCatalog.EXPLORER_LOAD_CHILDREN_NOT_MODIFIED)
                .tag("shortCircuit", "true")
                .register(registry);
        this.notModifiedAfterLoad = Counter.builder(DatawiseMetricsCatalog.EXPLORER_LOAD_CHILDREN_NOT_MODIFIED)
                .tag("shortCircuit", "false")
                .register(registry);
        this.modified = Counter.builder(DatawiseMetricsCatalog.EXPLORER_LOAD_CHILDREN_MODIFIED)
                .register(registry);
    }

    public void record(ExplorerChildLoadOutcome outcome) {
        if (outcome.notModified()) {
            if (outcome.shortCircuited()) {
                notModifiedShortCircuit.increment();
            } else {
                notModifiedAfterLoad.increment();
            }
        } else {
            modified.increment();
        }
    }
}
