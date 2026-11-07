package org.apache.datawise.backend.lineage.resolver;

import org.apache.datawise.backend.common.support.PathSegmentSanitizer;
import org.apache.datawise.backend.domain.ReadViewModelResult;
import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.model.LineageResolutionContext;
import org.apache.datawise.backend.lineage.model.LineageWarning;
import org.apache.datawise.backend.lineage.model.SourceKind;
import org.apache.datawise.backend.lineage.model.SourceRef;
import org.apache.datawise.backend.lineage.spi.SqlLineageParserRegistry;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

@Component
public class ViewModelLineageLoader {

    private final ViewModelReferenceResolver viewModelResolver;
    private final SqlLineageParserRegistry parserRegistry;

    public ViewModelLineageLoader(
            ViewModelReferenceResolver viewModelResolver,
            @Lazy SqlLineageParserRegistry parserRegistry
    ) {
        this.viewModelResolver = viewModelResolver;
        this.parserRegistry = parserRegistry;
    }

    public Optional<LineageParseResult> parseViewModel(
            String modelDisplayName,
            LineageParseRequest parentRequest,
            List<LineageWarning> warnings
    ) {
        String normalized = normalize(modelDisplayName);
        if (parentRequest.visitedModels().contains(normalized)) {
            warnings.add(LineageWarning.of(
                    "CIRCULAR_REF",
                    "Circular ViewModel reference: " + modelDisplayName
            ));
            return Optional.empty();
        }
        if (parentRequest.maxDepth() <= 0) {
            warnings.add(LineageWarning.of(
                    "MAX_DEPTH_EXCEEDED",
                    "Max lineage depth exceeded at ViewModel: " + modelDisplayName
            ));
            return Optional.empty();
        }
        Optional<ReadViewModelResult> viewModel = viewModelResolver.read(
                parentRequest.connectionId(),
                parentRequest.instanceName(),
                modelDisplayName
        );
        if (viewModel.isEmpty()) {
            warnings.add(LineageWarning.of(
                    "VIEW_MODEL_NOT_FOUND",
                    "ViewModel not found: " + modelDisplayName
            ));
            return Optional.empty();
        }
        String childModelName = PathSegmentSanitizer.viewModelDisplayName(viewModel.get().fileName());
        Set<String> visited = new HashSet<>(parentRequest.visitedModels());
        visited.add(normalize(childModelName));
        LineageParseRequest childRequest = new LineageParseRequest(
                viewModel.get().sql(),
                parentRequest.dbType(),
                parentRequest.connectionId(),
                parentRequest.instanceName(),
                parentRequest.database(),
                childModelName,
                parentRequest.maxDepth() - 1,
                Set.copyOf(visited),
                parentRequest.resolution()
        );
        return Optional.of(parserRegistry.parseWithFallback(childRequest));
    }

    public List<ColumnLineage> loadOutputColumns(
            String modelDisplayName,
            LineageParseRequest parentRequest,
            LineageResolutionContext resolution,
            List<LineageWarning> warnings
    ) {
        Optional<LineageParseResult> childResult = parseViewModel(modelDisplayName, parentRequest, warnings);
        if (childResult.isEmpty()) {
            return List.of();
        }
        warnings.addAll(childResult.get().warnings());
        if (childResult.get().columns().isEmpty()) {
            return List.of();
        }
        return toViewModelSourceColumns(modelDisplayName, parentRequest, childResult.get().columns());
    }

    private static List<ColumnLineage> toViewModelSourceColumns(
            String modelDisplayName,
            LineageParseRequest parentRequest,
            List<ColumnLineage> childColumns
    ) {
        List<ColumnLineage> outputs = new ArrayList<>(childColumns.size());
        for (ColumnLineage child : childColumns) {
            SourceRef viewModelSource = new SourceRef(
                    parentRequest.connectionId(),
                    parentRequest.database(),
                    null,
                    modelDisplayName,
                    child.outputColumn(),
                    modelDisplayName,
                    SourceKind.VIEW_MODEL
            );
            outputs.add(new ColumnLineage(
                    child.outputColumn(),
                    List.of(viewModelSource),
                    null
            ));
        }
        return outputs;
    }

    private static String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
