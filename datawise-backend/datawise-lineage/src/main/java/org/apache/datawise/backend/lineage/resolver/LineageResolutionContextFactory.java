package org.apache.datawise.backend.lineage.resolver;

import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.lineage.model.LineageResolutionContext;
import org.apache.datawise.backend.lineage.spi.SchemaCatalog;
import org.springframework.stereotype.Component;

@Component
public class LineageResolutionContextFactory {

    private final ViewModelReferenceResolver viewModelResolver;
    private final TableDetailService tableDetailService;

    public LineageResolutionContextFactory(
            ViewModelReferenceResolver viewModelResolver,
            TableDetailService tableDetailService
    ) {
        this.viewModelResolver = viewModelResolver;
        this.tableDetailService = tableDetailService;
    }

    public LineageResolutionContext create(String connectionId, String instanceName) {
        LineageResolutionContext viewModels = viewModelResolver.buildContext(connectionId, instanceName);
        SchemaCatalog schema = SchemaCatalog.EMPTY;
        if (connectionId != null && !connectionId.isBlank() && instanceName != null && !instanceName.isBlank()) {
            schema = new JdbcSchemaCatalog(tableDetailService, connectionId, instanceName);
        }
        return new LineageResolutionContext(schema, viewModels.viewModelNames());
    }
}
