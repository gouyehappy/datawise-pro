package org.apache.datawise.backend.database.federated;

import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.configstore.FederatedViewStore;
import org.apache.datawise.backend.domain.ExecuteFederatedViewRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.FederatedViewDetailDto;
import org.apache.datawise.backend.domain.FederatedViewSummaryDto;
import org.apache.datawise.backend.domain.SaveFederatedViewRequest;
import org.apache.datawise.backend.database.sql.SqlService;
import org.apache.datawise.backend.model.FederatedViewEntry;
import org.apache.datawise.backend.model.FederatedViewSource;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.sql.spi.SqlPaginationService;
import org.apache.datawise.sqlparser.SqlTransformOps;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 跨源联邦视图：解析 SQL 中的 {@code @alias} 占位符，在各源执行子查询后在内存中 JOIN。
 */
@Service
public class FederatedQueryService {

    private static final Pattern SOURCE_REF = Pattern.compile("@([a-zA-Z][\\w]*)");
    private static final Pattern JOIN_REF = Pattern.compile("\\bJOIN\\b", Pattern.CASE_INSENSITIVE);
    private static final String SOURCE_COLUMN = "__dw_source__";

    private final FederatedViewStore viewStore;
    private final SqlService sqlService;
    private final ConnectionVisibilityService connectionVisibilityService;
    private final SqlPaginationService paginationService;

    public FederatedQueryService(
            FederatedViewStore viewStore,
            SqlService sqlService,
            ConnectionVisibilityService connectionVisibilityService,
            @Autowired(required = false) SqlPaginationService paginationService
    ) {
        this.viewStore = viewStore;
        this.sqlService = sqlService;
        this.connectionVisibilityService = connectionVisibilityService;
        this.paginationService = paginationService;
    }

    public List<FederatedViewSummaryDto> list() {
        return viewStore.listAll().stream()
                .sorted(Comparator.comparing(FederatedViewEntry::getUpdatedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toSummary)
                .toList();
    }

    public FederatedViewDetailDto get(String id) {
        return toDetail(requireEntry(id));
    }

    public FederatedViewDetailDto save(SaveFederatedViewRequest request) {
        if (request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("name is required");
        }
        if (request.sources() == null || request.sources().size() < 2) {
            throw new IllegalArgumentException("at least two sources are required");
        }
        if (request.sql() == null || request.sql().isBlank()) {
            throw new IllegalArgumentException("sql is required");
        }
        Instant now = Instant.now();
        FederatedViewEntry entry = request.id() != null && !request.id().isBlank()
                ? viewStore.findById(request.id())
                : null;
        if (entry == null) {
            entry = new FederatedViewEntry();
            entry.setId(IdGenerator.shortId("fview-"));
            entry.setCreatedAt(now);
        }
        entry.setName(request.name().trim());
        entry.setDescription(trimOrNull(request.description()));
        entry.setSources(request.sources());
        entry.setSql(request.sql().trim());
        entry.setUpdatedAt(now);
        viewStore.upsert(entry);
        return toDetail(entry);
    }

    public void delete(String id) {
        requireEntry(id);
        viewStore.removeById(id);
    }

    public ExecuteSqlResult execute(ExecuteFederatedViewRequest request) {
        FederatedViewEntry view = requireEntry(request.viewId());
        int maxRows = FederatedJoinLimits.resolveMaxRows(request.maxRows());
        int offset = FederatedJoinLimits.resolveOffset(request.offset());
        return executeView(view, maxRows, offset);
    }

    ExecuteSqlResult executeView(FederatedViewEntry view, int maxRows) {
        return executeView(view, maxRows, 0);
    }

    ExecuteSqlResult executeView(FederatedViewEntry view, int maxRows, int offset) {
        Map<String, FederatedViewSource> sourceByAlias = new LinkedHashMap<>();
        for (FederatedViewSource source : view.getSources()) {
            if (source.getAlias() == null || source.getAlias().isBlank()) {
                throw new IllegalArgumentException("source alias is required");
            }
            String alias = source.getAlias().trim();
            if (sourceByAlias.put(alias, source) != null) {
                throw new IllegalArgumentException("duplicate source alias: " + alias);
            }
        }

        if (containsFederatedJoin(view.getSql())) {
            FederatedJoinSqlParser.FederatedJoinPlan plan = FederatedJoinSqlParser.parse(view.getSql());
            Map<String, String> dbTypeByAlias = resolveDbTypes(sourceByAlias);
            return FederatedJoinExecutor.execute(
                    view.getSql(),
                    plan,
                    sourceByAlias,
                    sqlService,
                    maxRows,
                    offset,
                    dbTypeByAlias,
                    paginationService
            );
        }

        Map<String, ExecuteSqlResult> partialResults = new LinkedHashMap<>();
        boolean sourceTruncated = false;
        Map<String, String> dbTypeByAlias = resolveDbTypes(sourceByAlias);
        for (FederatedViewSource source : view.getSources()) {
            String subSql = FederatedSqlSubquerySupport.extractSubQuery(view.getSql(), source.getAlias());
            if (subSql == null || subSql.isBlank()) {
                subSql = SqlTransformOps.selectAllFrom(source.getAlias());
            }
            subSql = FederatedSourceSqlSupport.applySourceWindow(
                    subSql,
                    dbTypeByAlias.get(source.getAlias()),
                    maxRows,
                    offset,
                    paginationService
            );
            ExecuteSqlResult partial = sqlService.execute(
                    subSql,
                    source.getConnectionId(),
                    source.getDatabase(),
                    maxRows,
                    null
            );
            partialResults.put(source.getAlias(), partial);
            if (partial.rows() != null && partial.rows().size() >= maxRows) {
                sourceTruncated = true;
            }
        }

        if (partialResults.size() == 1) {
            return partialResults.values().iterator().next();
        }

        ExecuteSqlResult merged = mergeResults(view.getSql(), sourceByAlias, partialResults);
        if (!sourceTruncated) {
            return merged;
        }
        return new ExecuteSqlResult(
                merged.sql(),
                merged.rowCount(),
                merged.durationMs(),
                merged.columns(),
                merged.rows(),
                merged.where(),
                merged.orderBy(),
                merged.cursorId(),
                Boolean.TRUE,
                offset > 0 ? offset : merged.pageOffset(),
                maxRows
        );
    }

    private Map<String, String> resolveDbTypes(Map<String, FederatedViewSource> sourceByAlias) {
        Map<String, String> dbTypeByAlias = new LinkedHashMap<>();
        for (Map.Entry<String, FederatedViewSource> entry : sourceByAlias.entrySet()) {
            FederatedViewSource source = entry.getValue();
            if (source.getConnectionId() == null || source.getConnectionId().isBlank()) {
                continue;
            }
            connectionVisibilityService.resolveConnectionEntity(source.getConnectionId())
                    .ifPresent(entity -> dbTypeByAlias.put(entry.getKey(), entity.getDbType()));
        }
        return dbTypeByAlias;
    }

    private static boolean containsFederatedJoin(String sql) {
        return sql != null && JOIN_REF.matcher(sql).find();
    }

    private ExecuteSqlResult mergeResults(
            String viewSql,
            Map<String, FederatedViewSource> sourceByAlias,
            Map<String, ExecuteSqlResult> partialResults
    ) {
        List<Map<String, Object>> mergedColumns = new ArrayList<>();
        Map<String, Object> sourceCol = new LinkedHashMap<>();
        sourceCol.put("name", SOURCE_COLUMN);
        sourceCol.put("key", SOURCE_COLUMN);
        mergedColumns.add(sourceCol);

        List<Map<String, Object>> mergedRows = new ArrayList<>();
        long totalDuration = 0L;

        Matcher matcher = SOURCE_REF.matcher(viewSql);
        String primaryAlias = matcher.find() ? matcher.group(1) : sourceByAlias.keySet().iterator().next();

        for (Map.Entry<String, ExecuteSqlResult> entry : partialResults.entrySet()) {
            ExecuteSqlResult partial = entry.getValue();
            totalDuration += partial.durationMs();
            FederatedViewSource source = sourceByAlias.get(entry.getKey());
            String label = formatSourceLabel(source);
            if (mergedColumns.size() == 1 && partial.columns() != null) {
                mergedColumns.addAll(partial.columns());
            }
            if (partial.rows() == null) {
                continue;
            }
            for (Map<String, Object> row : partial.rows()) {
                Map<String, Object> copy = new LinkedHashMap<>(row);
                copy.put(SOURCE_COLUMN, label);
                mergedRows.add(copy);
            }
        }

        return new ExecuteSqlResult(
                viewSql,
                mergedRows.size(),
                totalDuration,
                mergedColumns,
                mergedRows,
                null,
                null,
                null,
                null,
                null,
                null
        );
    }

    private static String formatSourceLabel(FederatedViewSource source) {
        String db = source.getDatabase();
        String conn = source.getConnectionLabel() != null && !source.getConnectionLabel().isBlank()
                ? source.getConnectionLabel()
                : source.getConnectionId();
        return db != null && !db.isBlank() ? conn + "/" + db : conn;
    }

    private FederatedViewEntry requireEntry(String id) {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("id is required");
        }
        FederatedViewEntry entry = viewStore.findById(id);
        if (entry == null) {
            throw new IllegalArgumentException("federated view not found: " + id);
        }
        return entry;
    }

    private FederatedViewSummaryDto toSummary(FederatedViewEntry entry) {
        return new FederatedViewSummaryDto(
                entry.getId(),
                entry.getName(),
                entry.getDescription(),
                entry.getSources() != null ? entry.getSources().size() : 0,
                entry.getUpdatedAt()
        );
    }

    private FederatedViewDetailDto toDetail(FederatedViewEntry entry) {
        return new FederatedViewDetailDto(
                entry.getId(),
                entry.getName(),
                entry.getDescription(),
                entry.getSources(),
                entry.getSql(),
                entry.getCreatedAt(),
                entry.getUpdatedAt()
        );
    }

    private static String trimOrNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
