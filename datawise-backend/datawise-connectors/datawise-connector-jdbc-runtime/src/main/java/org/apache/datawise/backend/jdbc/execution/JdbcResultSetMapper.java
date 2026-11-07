package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.jdbc.support.ResultSetColumnMapper;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Maps JDBC {@link ResultSet} rows into {@link TableDataResult} for API responses.
 */
public final class JdbcResultSetMapper {

    /**
     * Absolute heap-safety ceiling when callers request unbounded reads ({@code maxRows <= 0}).
     * Prefer {@link org.apache.datawise.backend.config.DatawiseQueryProperties#getAbsoluteMaxResultRows()}
     * at the service layer; this constant defends lower JDBC paths.
     */
    public static final int SAFETY_MAX_ROWS = 100_000;

    private JdbcResultSetMapper() {
    }

    /**
     * Reads remaining rows up to {@link #SAFETY_MAX_ROWS}.
     * Prefer {@link #mapLimited} with an explicit limit from the service layer.
     */
    public static TableDataResult mapAll(ResultSet rs) throws SQLException {
        return mapLimited(rs, SAFETY_MAX_ROWS);
    }

    /**
     * Reads at most {@code maxRows} rows (used with {@link java.sql.Statement#setMaxRows(int)}).
     * Does not probe for {@code hasMore}. When {@code maxRows <= 0}, applies {@link #SAFETY_MAX_ROWS}.
     */
    public static TableDataResult mapLimited(ResultSet rs, int maxRows) throws SQLException {
        int limit = maxRows > 0 ? maxRows : SAFETY_MAX_ROWS;
        ResultSetMetaData meta = rs.getMetaData();
        List<ResultSetColumnMapper.ColumnField> fields = ResultSetColumnMapper.buildFields(meta);
        List<Map<String, Object>> rows = new ArrayList<>(Math.max(16, Math.min(limit, 4096)));
        while (rs.next()) {
            rows.add(ResultSetColumnMapper.readRow(rs, fields));
            if (rows.size() >= limit) {
                break;
            }
        }
        return new TableDataResult(ResultSetColumnMapper.toColumnMaps(fields), rows, null, false, null, null);
    }

    /**
     * Reads up to {@code pageSize} rows and sets {@code hasMore} only when a probe row
     * ({@code pageSize + 1}) is present. Callers must request {@code LIMIT pageSize + 1}
     * (and a fetch size of at least that) so end-of-data is distinguishable from a full page.
     */
    public static TableDataResult mapPage(ResultSet rs, int pageSize) throws SQLException {
        return mapPage(rs, pageSize, false);
    }

    /**
     * @param preserveForMigration when true, cells keep JDBC types suitable for batch INSERT (migration).
     */
    public static TableDataResult mapPage(ResultSet rs, int pageSize, boolean preserveForMigration)
            throws SQLException {
        int limit = pageSize > 0 ? pageSize : SAFETY_MAX_ROWS;
        ResultSetMetaData meta = rs.getMetaData();
        List<ResultSetColumnMapper.ColumnField> fields = ResultSetColumnMapper.buildFields(meta);
        List<Map<String, Object>> rows = new ArrayList<>(Math.max(16, limit + 1));
        while (rs.next()) {
            rows.add(ResultSetColumnMapper.readRow(rs, fields, preserveForMigration));
            if (rows.size() > limit) {
                break;
            }
        }
        boolean hasMore = rows.size() > limit;
        if (hasMore) {
            rows.remove(limit);
        }
        return new TableDataResult(
                ResultSetColumnMapper.toColumnMaps(fields),
                rows,
                null,
                hasMore,
                null,
                limit
        );
    }
}
