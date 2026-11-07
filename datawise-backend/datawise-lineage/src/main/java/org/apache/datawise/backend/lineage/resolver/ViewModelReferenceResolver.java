package org.apache.datawise.backend.lineage.resolver;

import org.apache.datawise.backend.common.support.PathSegmentSanitizer;
import org.apache.datawise.backend.domain.ReadViewModelResult;
import org.apache.datawise.backend.domain.ViewModelFileDto;
import org.apache.datawise.backend.lineage.model.LineageResolutionContext;
import org.apache.datawise.backend.service.ViewModelService;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Component
public class ViewModelReferenceResolver {

    private final ViewModelService viewModelService;

    public ViewModelReferenceResolver(ViewModelService viewModelService) {
        this.viewModelService = viewModelService;
    }

    public LineageResolutionContext buildContext(String connectionId, String instanceName) {
        if (connectionId == null || connectionId.isBlank() || instanceName == null || instanceName.isBlank()) {
            return LineageResolutionContext.empty();
        }
        try {
            List<ViewModelFileDto> models = viewModelService.listViewModels(connectionId, instanceName);
            Map<String, String> index = new LinkedHashMap<>();
            for (ViewModelFileDto model : models) {
                String displayName = model.name();
                if (displayName == null || displayName.isBlank()) {
                    displayName = PathSegmentSanitizer.viewModelDisplayName(model.fileName());
                }
                index.putIfAbsent(normalize(displayName), model.fileName());
            }
            return new LineageResolutionContext(org.apache.datawise.backend.lineage.spi.SchemaCatalog.EMPTY, index);
        } catch (IOException ex) {
            return LineageResolutionContext.empty();
        }
    }

    public Optional<ReadViewModelResult> read(
            String connectionId,
            String instanceName,
            String modelDisplayName
    ) {
        if (connectionId == null || connectionId.isBlank()
                || instanceName == null || instanceName.isBlank()
                || modelDisplayName == null || modelDisplayName.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(viewModelService.read(connectionId, instanceName, modelDisplayName));
        } catch (IOException ex) {
            return Optional.empty();
        }
    }

    private static String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
