package org.apache.datawise.backend.schema.introspect.listing;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.jdbc.support.DbTypeFamilies;
import org.apache.datawise.backend.schema.introspect.JdbcSchemaListingScopes;
import org.apache.datawise.backend.schema.spi.ExplorerPageRequest;
import org.apache.datawise.backend.schema.spi.FastTableLister;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.sql.SQLException;
import java.util.Locale;

@Component
public final class OracleFastTableLister implements FastTableLister {

    private final JdbcTableListingSupport support;

    @Autowired
    public OracleFastTableLister(JdbcTableListingSupport support) {
        this.support = support;
    }

    @Override
    public boolean supports(String dbType) {
        return DbTypeFamilies.isOracleFamily(dbType) || DbTypeFamilies.isDmFamily(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public PaginatedTreeNodes listTablesPage(ExplorerPageRequest request) throws SQLException {
        String owner = resolveOwner(request);
        String pattern = JdbcTableListingSupport.toSqlLikePattern(request.namePattern());
        String like = pattern != null ? pattern.toUpperCase(Locale.ROOT) : null;
        String sql = """
                SELECT table_name
                FROM all_tables
                WHERE owner = ?
                AND NVL(iot_type, ' ') != 'IOT_OVERFLOW'
                AND table_name NOT LIKE 'BIN$%'
                """ + (like != null ? " AND table_name LIKE ?" : "") + """
                 ORDER BY table_name
                 OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
                """;
        return support.queryPagedTables(request, sql, JdbcTableListingSupport.bindOffsetFetch(owner, like));
    }

    /**
     * Owner for paged {@code all_tables} listing.
     * Prefer explicit schema, then scope schema pattern, then
     * {@link JdbcSchemaListingScopes#resolveOracleOwner} (catalog / connection / user).
     * Deliberately richer than {@code OracleFamilyDictionaryListing} view/routine owner
     * resolution �?do not share one helper without an Explorer product decision.
     */
    private static String resolveOwner(ExplorerPageRequest request) throws SQLException {
        if (request.schema() != null && !request.schema().isBlank()) {
            return request.schema().trim().toUpperCase(Locale.ROOT);
        }
        if (request.scope().schemaPattern() != null && !request.scope().schemaPattern().isBlank()
                && !"%".equals(request.scope().schemaPattern())) {
            return request.scope().schemaPattern().trim().toUpperCase(Locale.ROOT);
        }
        return JdbcSchemaListingScopes.resolveOracleOwner(
                request.catalog(),
                request.schema(),
                request.scope(),
                request.connection());
    }
}
