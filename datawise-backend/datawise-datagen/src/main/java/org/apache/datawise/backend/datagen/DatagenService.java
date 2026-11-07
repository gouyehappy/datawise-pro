package org.apache.datawise.backend.datagen;

import net.datafaker.Faker;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.datagen.type.GenContext;
import org.apache.datawise.datagen.type.TypeGeneratorRegistry;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;

@Service
public class DatagenService {

    public static final int DEFAULT_ROWS = 10;
    public static final int MAX_ROWS = 5000;
    public static final int DEFAULT_PREVIEW_ROWS = 5;

    private final ConnectionExecutionContext connectionContext;
    private final TableDetailService tableDetailService;
    private final ConnectorFacade connectorFacade;

    public DatagenService(
            ConnectionExecutionContext connectionContext,
            TableDetailService tableDetailService,
            ConnectorFacade connectorFacade
    ) {
        this.connectionContext = connectionContext;
        this.tableDetailService = tableDetailService;
        this.connectorFacade = connectorFacade;
    }

    public DatagenPreviewResult preview(DatagenPreviewRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("request is required");
        }
        String connectionId = requireNonBlank(request.connectionId(), "connectionId is required");
        String tableName = requireNonBlank(request.tableName(), "tableName is required");

        ConnectionExecutionContext.ResolvedConnectionWithDatabase resolved =
                connectionContext.requireAvailableWithDatabaseForCurrentUser(
                        connectionId,
                        request.database(),
                        ConnectionExecutionContext.DEFAULT_CONNECTION_NOT_FOUND
                );

        String database = resolved.database();
        String dbType = resolved.entity().getDbType();

        TablePropertiesResult properties = tableDetailService.loadProperties(tableName, connectionId, database);
        int rowCount = clampRowCount(request.rowCount());
        long seed = request.seed() != null ? request.seed() : System.currentTimeMillis();
        int rowOffset = request.rowOffset() != null ? Math.max(0, request.rowOffset()) : 0;

        List<TableColumnDetail> insertableColumns = properties.columns().stream()
                .filter(col -> !(col.autoIncrement() && "PRI".equalsIgnoreCase(col.keyType())))
                .toList();
        if (insertableColumns.isEmpty()) {
            return new DatagenPreviewResult(connectionId, database, tableName, rowCount, seed, List.of(),
                    "-- no insertable columns\n");
        }

        List<Map<String, Object>> rows = generateRows(insertableColumns, rowCount, seed, rowOffset);

        String insertSql = buildInsertSql(dbType, database, properties.tableName(), insertableColumns, rows);
        List<Map<String, Object>> previewRows = rows.subList(0, Math.min(DEFAULT_PREVIEW_ROWS, rows.size()));
        return new DatagenPreviewResult(connectionId, database, tableName, rowCount, seed, previewRows, insertSql);
    }

    public List<Map<String, Object>> generateRows(
            String connectionId,
            String database,
            String tableName,
            int rowCount,
            long seed,
            int rowOffset
    ) {
        String resolvedConnectionId = requireNonBlank(connectionId, "connectionId is required");
        String resolvedTableName = requireNonBlank(tableName, "tableName is required");

        ConnectionExecutionContext.ResolvedConnectionWithDatabase resolved =
                connectionContext.requireAvailableWithDatabaseForCurrentUser(
                        resolvedConnectionId,
                        database,
                        ConnectionExecutionContext.DEFAULT_CONNECTION_NOT_FOUND
                );

        TablePropertiesResult properties = tableDetailService.loadProperties(
                resolvedTableName,
                resolvedConnectionId,
                resolved.database()
        );
        List<TableColumnDetail> insertableColumns = properties.columns().stream()
                .filter(col -> !(col.autoIncrement() && "PRI".equalsIgnoreCase(col.keyType())))
                .toList();
        if (insertableColumns.isEmpty()) {
            return List.of();
        }
        return generateRows(insertableColumns, clampRowCount(rowCount), seed, Math.max(0, rowOffset));
    }

    private List<Map<String, Object>> generateRows(
            List<TableColumnDetail> insertableColumns,
            int rowCount,
            long seed,
            int rowOffset
    ) {
        Random random = new Random(seed);
        Faker faker = new Faker(new Locale("zh", "CN"), random);
        GenContext ctx = new GenContext(faker, random);

        record ColumnGenerator(TableColumnDetail column, org.apache.datawise.datagen.type.base.IGenerator<?> generator) {
            Object generate(GenContext ctx) {
                @SuppressWarnings("unchecked")
                org.apache.datawise.datagen.type.base.IGenerator<Object> gen =
                        (org.apache.datawise.datagen.type.base.IGenerator<Object>) generator;
                return gen.generateData(column.name(), ctx);
            }
        }

        List<ColumnGenerator> generators = insertableColumns.stream()
                .map(col -> new ColumnGenerator(col, TypeGeneratorRegistry.resolve(col.dataType(), col.name())))
                .toList();

        List<Map<String, Object>> rows = new ArrayList<>(rowCount);
        double nullableChance = 0.1d;
        for (int i = 0; i < rowCount; i++) {
            ctx.setRowIndex(rowOffset + i);
            Map<String, Object> row = new LinkedHashMap<>();
            for (ColumnGenerator item : generators) {
                TableColumnDetail col = item.column();
                if (col.nullable() && ctx.random().nextDouble() < nullableChance) {
                    row.put(col.name(), null);
                    continue;
                }
                row.put(col.name(), item.generate(ctx));
            }
            rows.add(row);
        }
        return rows;
    }

    private String buildInsertSql(
            String dbType,
            String database,
            String tableName,
            List<TableColumnDetail> insertableColumns,
            List<Map<String, Object>> rows
    ) {
        List<Map<String, Object>> columns = new ArrayList<>(insertableColumns.size());
        for (TableColumnDetail col : insertableColumns) {
            columns.add(Map.of("name", col.name(), "key", col.name()));
        }
        return connectorFacade.dml().buildMultiInsert(dbType, database, tableName, columns, rows) + ";\n";
    }

    private static int clampRowCount(Integer value) {
        if (value == null) {
            return DEFAULT_ROWS;
        }
        if (value < 1) {
            return 1;
        }
        return Math.min(MAX_ROWS, value);
    }

    private static String requireNonBlank(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }
        return value.trim();
    }
}

