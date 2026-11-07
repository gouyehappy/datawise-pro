package org.apache.datawise.backend.jdbc.support;

import java.sql.Connection;
import java.sql.SQLException;

/**
 * 在池化 JDBC 连接上执行回调；由 {@link org.apache.datawise.backend.jdbc.connection.JdbcConnectionAccessor}
 * 统一处理 catalog 切换与 transient 重试。
 */
public interface JdbcConnectionCallback<T> {

    T apply(Connection connection) throws SQLException;
}
