package org.apache.datawise.backend.lineage.service;



import org.apache.datawise.backend.common.pack.ViewModelLineageHooks;
import org.apache.datawise.backend.common.support.PathSegmentSanitizer;

import org.apache.datawise.backend.configstore.ConnectionStore;

import org.apache.datawise.backend.domain.LineageGraphDto;

import org.apache.datawise.backend.domain.FederatedLineageSourceDto;
import org.apache.datawise.backend.domain.LineageImpactDto;
import org.apache.datawise.backend.domain.LineageImpactItemDto;
import org.apache.datawise.backend.domain.ParseLineageRequest;

import org.apache.datawise.backend.domain.ReadViewModelResult;
import org.apache.datawise.backend.domain.ViewModelFileDto;

import org.apache.datawise.backend.lineage.config.LineageProperties;

import org.apache.datawise.backend.lineage.model.FederatedLineageSource;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;

import org.apache.datawise.backend.lineage.model.LineageParseResult;

import org.apache.datawise.backend.lineage.model.LineageResolutionContext;

import org.apache.datawise.backend.lineage.resolver.LineageResolutionContextFactory;

import org.apache.datawise.backend.lineage.spi.SqlLineageParserRegistry;

import org.apache.datawise.backend.lineage.store.ViewModelLineageStore;

import org.apache.datawise.backend.lineage.support.LineageReferenceCollector;
import org.apache.datawise.backend.lineage.support.LineageSqlHash;

import org.apache.datawise.backend.model.ConnectionEntity;

import org.apache.datawise.backend.service.ViewModelService;

import org.slf4j.Logger;

import org.slf4j.LoggerFactory;

import org.springframework.stereotype.Service;



import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;



@Service
public class LineageService implements ViewModelLineageHooks {



    private static final Logger log = LoggerFactory.getLogger(LineageService.class);



    private final ViewModelService viewModelService;

    private final ViewModelLineageStore lineageStore;

    private final SqlLineageParserRegistry parserRegistry;

    private final LineageGraphBuilder graphBuilder;

    private final ConnectionStore connectionStore;

    private final LineageProperties properties;

    private final LineageResolutionContextFactory resolutionContextFactory;



    public LineageService(

            ViewModelService viewModelService,

            ViewModelLineageStore lineageStore,

            SqlLineageParserRegistry parserRegistry,

            LineageGraphBuilder graphBuilder,

            ConnectionStore connectionStore,

            LineageProperties properties,

            LineageResolutionContextFactory resolutionContextFactory

    ) {

        this.viewModelService = viewModelService;

        this.lineageStore = lineageStore;

        this.parserRegistry = parserRegistry;

        this.graphBuilder = graphBuilder;

        this.connectionStore = connectionStore;

        this.properties = properties;

        this.resolutionContextFactory = resolutionContextFactory;

    }



    public LineageGraphDto getViewModelLineage(

            String connectionId,

            String instanceName,

            String name,

            boolean forceRefresh

    ) throws IOException {

        ReadViewModelResult viewModel = viewModelService.read(connectionId, instanceName, name);

        String fileName = viewModel.fileName();

        String sql = viewModel.sql();

        String modelName = PathSegmentSanitizer.viewModelDisplayName(fileName);

        if (!forceRefresh) {

            LineageGraphDto cached = lineageStore.read(connectionId, instanceName, fileName);

            if (!lineageStore.isStale(cached, sql)) {

                return cached;

            }

        }

        return parseAndPersist(connectionId, instanceName, fileName, modelName, sql, resolveDbType(connectionId));

    }



    public LineageGraphDto parseLineage(ParseLineageRequest request) throws IOException {

        String sql = request.sql();

        String connectionId = request.connectionId();

        String instanceName = request.instanceName();

        String dbType = request.dbType() != null && !request.dbType().isBlank()

                ? request.dbType()

                : resolveDbType(connectionId);

        int maxDepth = request.maxDepth() != null && request.maxDepth() > 0

                ? request.maxDepth()

                : properties.getMaxDepth();

        String modelName = request.name() != null && !request.name().isBlank()

                ? request.name()

                : "preview";

        if (sql == null || sql.isBlank()) {

            if (connectionId == null || instanceName == null || request.name() == null) {

                throw new IllegalArgumentException("sql or view model identity is required");

            }

            ReadViewModelResult viewModel = viewModelService.read(connectionId, instanceName, request.name());

            sql = viewModel.sql();

            modelName = PathSegmentSanitizer.viewModelDisplayName(viewModel.fileName());

        }

        LineageParseRequest parseRequest = buildParseRequest(

                sql,

                dbType,

                connectionId,

                instanceName,

                modelName,

                maxDepth,

                Set.of(normalizeModelName(modelName)),
                request.federatedSources()
        );

        LineageParseResult parseResult = parserRegistry.parseWithFallback(parseRequest);
        log.info(
                "Lineage parse result model={} dbType={} parser={} version={} compatibility={} status={} warnings={}",
                modelName,
                dbType,
                parseResult.engineId(),
                parseResult.engineVersion(),
                parseResult.dialectCompatibility(),
                parseResult.status(),
                parseResult.warnings().size()
        );

        LineageGraphDto graph = graphBuilder.build(

                modelName,

                sql,

                dbType,

                maxDepth,

                parseResult,

                parseRequest

        );

        if (Boolean.TRUE.equals(request.forceRefresh())

                && connectionId != null

                && instanceName != null

                && request.name() != null) {

            ReadViewModelResult viewModel = viewModelService.read(connectionId, instanceName, request.name());

            lineageStore.write(connectionId, instanceName, viewModel.fileName(), graph);

        }

        return graph;

    }



    @Override
    public LineageGraphDto parseAndPersist(

            String connectionId,

            String instanceName,

            String fileName,

            String modelName,

            String sql,

            String dbType

    ) {

        try {

            LineageParseRequest parseRequest = buildParseRequest(

                    sql,

                    dbType,

                    connectionId,

                    instanceName,

                    modelName,

                    properties.getMaxDepth(),

                    Set.of(normalizeModelName(modelName))

            );

            LineageParseResult parseResult = parserRegistry.parseWithFallback(parseRequest);
            log.info(
                    "Lineage parse result model={} dbType={} parser={} version={} compatibility={} status={} warnings={}",
                    modelName,
                    dbType,
                    parseResult.engineId(),
                    parseResult.engineVersion(),
                    parseResult.dialectCompatibility(),
                    parseResult.status(),
                    parseResult.warnings().size()
            );

            LineageGraphDto graph = graphBuilder.build(

                    modelName,

                    sql,

                    dbType,

                    properties.getMaxDepth(),

                    parseResult,

                    parseRequest

            );

            lineageStore.write(connectionId, instanceName, fileName, graph);

            return graph;

        } catch (Exception ex) {

            log.warn("Lineage parse failed for model {}: {}", modelName, ex.getMessage());

            return null;

        }

    }



    @Override
    public LineageImpactDto findDownstreamImpact(
            String connectionId,
            String instanceName,
            String modelName
    ) throws IOException {
        ReadViewModelResult sourceModel = viewModelService.read(connectionId, instanceName, modelName);
        String sourceDisplayName = PathSegmentSanitizer.viewModelDisplayName(sourceModel.fileName());
        String targetNormalized = normalizeModelName(sourceDisplayName);
        String dbType = resolveDbType(connectionId);

        List<LineageImpactItemDto> downstream = new ArrayList<>();
        for (ViewModelFileDto candidate : viewModelService.listViewModels(connectionId, instanceName)) {
            String candidateName = resolveModelDisplayName(candidate);
            if (normalizeModelName(candidateName).equals(targetNormalized)) {
                continue;
            }
            ReadViewModelResult candidateModel = viewModelService.read(connectionId, instanceName, candidateName);
            LineageParseRequest parseRequest = buildParseRequest(
                    candidateModel.sql(),
                    dbType,
                    connectionId,
                    instanceName,
                    candidateName,
                    properties.getMaxDepth(),
                    Set.of(normalizeModelName(candidateName))
            );
            LineageParseResult parseResult = parserRegistry.parseWithFallback(parseRequest);
            log.info(
                    "Lineage impact parse result model={} dbType={} parser={} version={} compatibility={} status={} warnings={}",
                    candidateName,
                    dbType,
                    parseResult.engineId(),
                    parseResult.engineVersion(),
                    parseResult.dialectCompatibility(),
                    parseResult.status(),
                    parseResult.warnings().size()
            );
            if (!LineageReferenceCollector.referencesViewModel(parseResult, targetNormalized)) {
                continue;
            }
            LineageGraphDto sidecar = lineageStore.read(connectionId, instanceName, candidateModel.fileName());
            boolean staleSidecar = lineageStore.isStale(sidecar, candidateModel.sql());
            downstream.add(new LineageImpactItemDto(candidateName, candidateModel.fileName(), staleSidecar));
        }
        return new LineageImpactDto(sourceDisplayName, downstream);
    }



    @Override
    public void deleteSidecar(String connectionId, String instanceName, String name) {

        try {

            String fileName = PathSegmentSanitizer.sanitizeViewModelFileName(name, "query.view.sql");

            lineageStore.delete(connectionId, instanceName, fileName);

        } catch (IOException ex) {

            log.warn("Failed to delete lineage sidecar for {}: {}", name, ex.getMessage());

        }

    }



    private LineageParseRequest buildParseRequest(
            String sql,
            String dbType,
            String connectionId,
            String instanceName,
            String modelName,
            int maxDepth,
            Set<String> visitedModels
    ) {
        return buildParseRequest(sql, dbType, connectionId, instanceName, modelName, maxDepth, visitedModels, List.of());
    }

    private LineageParseRequest buildParseRequest(
            String sql,
            String dbType,
            String connectionId,
            String instanceName,
            String modelName,
            int maxDepth,
            Set<String> visitedModels,
            List<FederatedLineageSourceDto> federatedSources
    ) {
        LineageResolutionContext resolution = resolutionContextFactory.create(connectionId, instanceName);
        return new LineageParseRequest(
                LineageSqlHash.normalize(sql),
                dbType,
                connectionId,
                instanceName,
                instanceName,
                modelName,
                maxDepth,
                visitedModels,
                resolution,
                mapFederatedSources(federatedSources)
        );
    }

    private static List<FederatedLineageSource> mapFederatedSources(List<FederatedLineageSourceDto> sources) {
        if (sources == null || sources.isEmpty()) {
            return List.of();
        }
        return sources.stream()
                .map(source -> new FederatedLineageSource(
                        source.alias(),
                        source.connectionId(),
                        source.database(),
                        source.dbType()
                ))
                .toList();
    }



    private String resolveDbType(String connectionId) {

        if (connectionId == null || connectionId.isBlank()) {

            return "generic";

        }

        return connectionStore.findConnectionById(connectionId)

                .map(ConnectionEntity::getDbType)

                .filter(value -> value != null && !value.isBlank())

                .orElse("generic");

    }



    private static String normalizeModelName(String modelName) {

        return modelName == null ? "" : modelName.trim().toLowerCase(Locale.ROOT);

    }

    private static String resolveModelDisplayName(ViewModelFileDto model) {
        if (model.name() != null && !model.name().isBlank()) {
            return model.name();
        }
        return PathSegmentSanitizer.viewModelDisplayName(model.fileName());
    }

}


