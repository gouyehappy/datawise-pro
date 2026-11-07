package org.apache.datawise.backend.schema.introspect;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/** Runs a single-column name query for Explorer metadata listers. */
public final class JdbcNameQuerySupport {

    private JdbcNameQuerySupport() {
    }

    public static List<String> queryNames(Connection connection, String sql, SqlBinder binder) throws SQLException {
        List<String> names = new ArrayList<>();
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            binder.bind(ps);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String name = rs.getString(1);
                    if (name != null && !name.isBlank()) {
                        names.add(name.trim());
                    }
                }
            }
        }
        return names;
    }

    @FunctionalInterface
    public interface SqlBinder {

        void bind(PreparedStatement ps) throws SQLException;
    }
}
