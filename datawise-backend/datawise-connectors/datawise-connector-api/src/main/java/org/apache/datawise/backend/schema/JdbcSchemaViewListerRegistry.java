package org.apache.datawise.backend.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.spi.JdbcSchemaViewLister;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/** Resolves {@link JdbcSchemaViewLister} by dbType (classpath beans, lowest priority wins). */
@Component
public class JdbcSchemaViewListerRegistry {

    private final List<JdbcSchemaViewLister> listers;

    public JdbcSchemaViewListerRegistry(List<JdbcSchemaViewLister> listers) {
        this.listers = listers == null ? List.of() : List.copyOf(listers);
    }

    public Optional<JdbcSchemaViewLister> find(String dbType) {
        String normalized = DbType.normalizeId(dbType);
        return listers.stream()
                .filter(lister -> lister.supports(normalized))
                .min(Comparator.comparingInt(JdbcSchemaViewLister::priority));
    }
}
