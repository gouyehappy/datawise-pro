package org.apache.datawise.backend.database.drift;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.SchemaDriftMonitorStore;
import org.apache.datawise.backend.domain.SchemaDriftCompareRequest;
import org.apache.datawise.backend.domain.SchemaDriftMonitorDto;
import org.apache.datawise.backend.domain.SchemaDriftReportDto;
import org.apache.datawise.backend.domain.SchemaDriftTableDiffDto;
import org.apache.datawise.backend.domain.SaveSchemaDriftMonitorRequest;
import org.apache.datawise.backend.domain.SchemaTablesResult;
import org.apache.datawise.backend.domain.SchemaTableSummary;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.migration.TableMigrationPreflightSupport;
import org.apache.datawise.backend.migration.TableMigrationPreflightSupport.ColumnCompareResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.SchemaDriftMonitorEntry;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.ConnectionAccessService;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.outbound.OutboundEventSignals;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

@Service
public class SchemaDriftService {

    private final SchemaDriftMonitorStore monitorStore;
    private final TableDetailService tableDetailService;
    private final ConnectionVisibilityService connectionVisibilityService;
    private final ConnectionAccessService connectionAccessService;
    private final OutboundEventSignals outboundEventSignals;
    private final ObjectMapper objectMapper;

    public SchemaDriftService(
            SchemaDriftMonitorStore monitorStore,
            TableDetailService tableDetailService,
            ConnectionVisibilityService connectionVisibilityService,
            ConnectionAccessService connectionAccessService,
            OutboundEventSignals outboundEventSignals,
            ObjectMapper objectMapper
    ) {
        this.monitorStore = monitorStore;
        this.tableDetailService = tableDetailService;
        this.connectionVisibilityService = connectionVisibilityService;
        this.connectionAccessService = connectionAccessService;
        this.outboundEventSignals = outboundEventSignals;
        this.objectMapper = objectMapper;
    }

    public List<SchemaDriftMonitorDto> listMonitors() {
        return monitorStore.listAll().stream()
                .sorted(Comparator.comparing(SchemaDriftMonitorEntry::getName, String.CASE_INSENSITIVE_ORDER))
                .map(this::toMonitorDto)
                .toList();
    }

    public SchemaDriftMonitorDto saveMonitor(SaveSchemaDriftMonitorRequest request) {
        if (request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("name is required");
        }
        SchemaDriftMonitorEntry entry = request.id() != null && !request.id().isBlank()
                ? requireMonitor(request.id())
                : new SchemaDriftMonitorEntry();
        if (entry.getId() == null) {
            entry.setId(IdGenerator.shortId("drift-"));
        }
        entry.setName(request.name().trim());
        entry.setSourceConnectionId(requireText(request.sourceConnectionId(), "sourceConnectionId"));
        entry.setSourceDatabase(trimOrNull(request.sourceDatabase()));
        entry.setTargetConnectionId(requireText(request.targetConnectionId(), "targetConnectionId"));
        entry.setTargetDatabase(trimOrNull(request.targetDatabase()));
        entry.setTablePattern(trimOrNull(request.tablePattern()));
        if (request.enabled() != null) {
            entry.setEnabled(request.enabled());
        }
        monitorStore.upsert(entry);
        return toMonitorDto(entry);
    }

    public void deleteMonitor(String id) {
        requireMonitor(id);
        monitorStore.removeById(id);
    }

    public SchemaDriftReportDto compare(SchemaDriftCompareRequest request) {
        ConnectionEntity source = requireConnection(request.sourceConnectionId());
        ConnectionEntity target = requireConnection(request.targetConnectionId());
        Long userId = UserContext.requireUserId();
        connectionAccessService.requireEngineFeature(userId, request.sourceConnectionId(), "schemaCompare");
        connectionAccessService.requireEngineFeature(userId, request.targetConnectionId(), "schemaCompare");
        Instant now = Instant.now();
        Pattern pattern = compilePattern(request.tablePattern());

        List<String> tables = listTables(request.sourceConnectionId(), request.sourceDatabase()).stream()
                .filter(name -> pattern == null || pattern.matcher(name).matches())
                .toList();

        List<SchemaDriftTableDiffDto> diffs = new ArrayList<>();
        for (String table : tables) {
            SchemaDriftTableDiffDto diff = compareTable(
                    table,
                    source,
                    request.sourceDatabase(),
                    target,
                    request.targetDatabase()
            );
            if (!"match".equals(diff.status())) {
                diffs.add(diff);
            }
        }

        return new SchemaDriftReportDto(
                request.sourceConnectionId(),
                request.sourceDatabase(),
                request.targetConnectionId(),
                request.targetDatabase(),
                now,
                diffs.size(),
                diffs
        );
    }

    public SchemaDriftReportDto runMonitor(String monitorId) {
        SchemaDriftMonitorEntry monitor = requireMonitor(monitorId);
        SchemaDriftReportDto report = compare(new SchemaDriftCompareRequest(
                monitor.getSourceConnectionId(),
                monitor.getSourceDatabase(),
                monitor.getTargetConnectionId(),
                monitor.getTargetDatabase(),
                monitor.getTablePattern()
        ));
        monitor.setLastCheckedAt(report.comparedAt());
        monitor.setDriftCount(report.driftTableCount());
        try {
            monitor.setLastReportJson(objectMapper.writeValueAsString(report));
        } catch (Exception ignored) {
            monitor.setLastReportJson(null);
        }
        monitorStore.upsert(monitor);
        try {
            if (UserContext.getUserId() != null) {
                int driftCount = report.driftTableCount();
                if (driftCount > 0) {
                    outboundEventSignals.schemaDriftDetected(monitorId, driftCount);
                } else {
                    outboundEventSignals.schemaDriftClean(monitorId, driftCount);
                }
            }
        } catch (RuntimeException ignored) {
            // outbound must not break monitor runs
        }
        return report;
    }

    private SchemaDriftTableDiffDto compareTable(
            String tableName,
            ConnectionEntity source,
            String sourceDatabase,
            ConnectionEntity target,
            String targetDatabase
    ) {
        TablePropertiesResult sourceProps = tryLoadProperties(tableName, source.getId(), sourceDatabase);
        TablePropertiesResult targetProps = tryLoadProperties(tableName, target.getId(), targetDatabase);

        boolean sourceExists = sourceProps != null && hasColumns(sourceProps);
        boolean targetExists = targetProps != null && hasColumns(targetProps);

        List<TableColumnDetail> sourceColumns = sourceExists ? sourceProps.columns() : List.of();
        List<TableColumnDetail> targetColumns = targetExists ? targetProps.columns() : List.of();

        ColumnCompareResult compare = TableMigrationPreflightSupport.compareColumns(sourceColumns, targetColumns);
        var statusResult = TableMigrationPreflightSupport.resolveStatus(
                sourceExists,
                targetExists,
                compare.missingOnTarget(),
                compare.extraOnTarget(),
                compare.typeMismatches(),
                compare.attributeMismatches()
        );

        String suggestedAlter = buildSuggestedSyncSql(
                tableName,
                source,
                sourceDatabase,
                target,
                targetDatabase,
                sourceExists,
                targetExists,
                sourceColumns,
                compare.missingOnTarget(),
                compare.extraOnTarget(),
                compare.typeMismatches(),
                compare.attributeMismatches()
        );

        return new SchemaDriftTableDiffDto(
                tableName,
                mapDriftStatus(statusResult.status()),
                compare.missingOnTarget(),
                compare.extraOnTarget(),
                compare.typeMismatches(),
                compare.attributeMismatches(),
                suggestedAlter
        );
    }

    private String buildSuggestedSyncSql(
            String tableName,
            ConnectionEntity source,
            String sourceDatabase,
            ConnectionEntity target,
            String targetDatabase,
            boolean sourceExists,
            boolean targetExists,
            List<TableColumnDetail> sourceColumns,
            List<String> missingOnTarget,
            List<String> extraOnTarget,
            List<String> typeMismatches,
            List<String> attributeMismatches
    ) {
        if (!sourceExists) {
            return null;
        }
        if (!targetExists) {
            try {
                var ddl = tableDetailService.loadDdl(tableName, source.getId(), sourceDatabase);
                return SchemaDriftSyncSql.wrapCreateTableDdl(ddl != null ? ddl.ddl() : null);
            } catch (RuntimeException ignored) {
                return "-- Target table missing; export source DDL manually for: " + tableName + "\n";
            }
        }
        return SchemaDriftSyncSql.buildColumnSyncSql(
                target.getDbType(),
                targetDatabase,
                tableName,
                sourceColumns,
                missingOnTarget,
                extraOnTarget,
                typeMismatches,
                attributeMismatches
        );
    }

    private static String mapDriftStatus(String preflightStatus) {
        if (TableMigrationPreflightSupport.STATUS_READY.equals(preflightStatus)) {
            return "match";
        }
        return preflightStatus;
    }

    private List<String> listTables(String connectionId, String database) {
        SchemaTablesResult result = tableDetailService.loadSchemaTables(connectionId, database);
        return result.tables().stream().map(SchemaTableSummary::tableName).toList();
    }

    private TablePropertiesResult tryLoadProperties(String table, String connectionId, String database) {
        try {
            return tableDetailService.loadProperties(table, connectionId, database);
        } catch (Exception ex) {
            return null;
        }
    }

    private static boolean hasColumns(TablePropertiesResult props) {
        return props.columns() != null && !props.columns().isEmpty();
    }

    private ConnectionEntity requireConnection(String connectionId) {
        return connectionVisibilityService.resolveConnectionEntity(connectionId)
                .orElseThrow(() -> new IllegalArgumentException("connection not found: " + connectionId));
    }

    private SchemaDriftMonitorEntry requireMonitor(String id) {
        SchemaDriftMonitorEntry entry = monitorStore.findById(id);
        if (entry == null) {
            throw new IllegalArgumentException("monitor not found: " + id);
        }
        return entry;
    }

    private SchemaDriftMonitorDto toMonitorDto(SchemaDriftMonitorEntry entry) {
        return new SchemaDriftMonitorDto(
                entry.getId(),
                entry.getName(),
                entry.getSourceConnectionId(),
                entry.getSourceDatabase(),
                entry.getTargetConnectionId(),
                entry.getTargetDatabase(),
                entry.getTablePattern(),
                entry.isEnabled(),
                entry.getLastCheckedAt(),
                entry.getDriftCount()
        );
    }

    static Pattern compilePattern(String pattern) {
        if (pattern == null || pattern.isBlank()) {
            return null;
        }
        String trimmed = pattern.trim();
        if ("%".equals(trimmed)) {
            return null;
        }
        if (trimmed.contains("%")) {
            return Pattern.compile(sqlLikePercentPattern(trimmed), Pattern.CASE_INSENSITIVE);
        }
        return Pattern.compile(trimmed, Pattern.CASE_INSENSITIVE);
    }

    private static String sqlLikePercentPattern(String pattern) {
        StringBuilder regex = new StringBuilder("^");
        for (int i = 0; i < pattern.length(); i++) {
            char ch = pattern.charAt(i);
            if (ch == '%') {
                regex.append(".*");
            } else {
                appendRegexLiteral(regex, ch);
            }
        }
        regex.append("$");
        return regex.toString();
    }

    private static void appendRegexLiteral(StringBuilder regex, char ch) {
        if ("\\.[]{}()+-^$?|*".indexOf(ch) >= 0) {
            regex.append('\\');
        }
        regex.append(ch);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value.trim();
    }

    private static String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
