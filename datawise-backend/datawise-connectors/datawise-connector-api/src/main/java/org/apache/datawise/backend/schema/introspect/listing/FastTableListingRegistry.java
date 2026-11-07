package org.apache.datawise.backend.schema.introspect.listing;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.schema.spi.ExplorerPageRequest;
import org.apache.datawise.backend.schema.spi.FastTableLister;
import org.springframework.stereotype.Component;

import java.sql.SQLException;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/** Resolves {@link FastTableLister} by dbType (Spring beans + optional builtins for tests). */
@Component
public final class FastTableListingRegistry {

    private final List<FastTableLister> listers;
    private final ConcurrentMap<String, FastTableLister> cache = new ConcurrentHashMap<>();

    public FastTableListingRegistry(List<FastTableLister> listers) {
        this.listers = listers == null || listers.isEmpty()
                ? List.of()
                : List.copyOf(listers);
    }

    /** Test / non-Spring path: register the built-in dialect listers. */
    public static FastTableListingRegistry withBuiltins(JdbcTableListingSupport support) {
        return new FastTableListingRegistry(builtinListers(support));
    }

    static List<FastTableLister> builtinListers(JdbcTableListingSupport support) {
        return List.of(
                new MysqlProtocolFastTableLister(support),
                new PostgresqlFastTableLister(support),
                new SqlServerFastTableLister(support),
                new OracleFastTableLister(support),
                new CatalogSchemaFastTableLister(support),
                new Db2FastTableLister(support),
                new ClickHouseFastTableLister(support),
                new SqliteFastTableLister(support),
                new EmbeddedEngineFastTableLister(support));
    }

    public boolean supportsFastListing(String dbType) {
        return find(dbType).isPresent();
    }

    public Optional<FastTableLister> find(String dbType) {
        String normalized = DbType.normalizeId(dbType);
        FastTableLister cached = cache.get(normalized);
        if (cached != null) {
            return Optional.of(cached);
        }
        Optional<FastTableLister> found = listers.stream()
                .filter(lister -> lister.supports(normalized))
                .min(Comparator.comparingInt(FastTableLister::priority));
        found.ifPresent(lister -> cache.put(normalized, lister));
        return found;
    }

    public PaginatedTreeNodes listTablesPage(ExplorerPageRequest request, String dbType) throws SQLException {
        FastTableLister lister = find(dbType).orElse(null);
        if (lister == null) {
            return null;
        }
        return lister.listTablesPage(request);
    }
}
