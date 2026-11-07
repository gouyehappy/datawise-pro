package org.apache.datawise.backend.schema;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.schema.spi.JdbcRoutineLister;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/** Resolves {@link JdbcRoutineLister} by dbType (classpath beans, lowest priority wins). */
@Component
public class JdbcRoutineListerRegistry {

    private final List<JdbcRoutineLister> listers;

    public JdbcRoutineListerRegistry(List<JdbcRoutineLister> listers) {
        this.listers = listers == null ? List.of() : List.copyOf(listers);
    }

    public Optional<JdbcRoutineLister> find(String dbType) {
        String normalized = DbType.normalizeId(dbType);
        return listers.stream()
                .filter(lister -> lister.supports(normalized))
                .min(Comparator.comparingInt(JdbcRoutineLister::priority));
    }
}
