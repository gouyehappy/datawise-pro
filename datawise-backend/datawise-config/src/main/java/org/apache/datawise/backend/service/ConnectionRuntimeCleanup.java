package org.apache.datawise.backend.service;

import java.util.List;

/**
 * 会话退出时的运行时资源清理（JDBC 连接池等），由 database 模块实现。
 */
public interface ConnectionRuntimeCleanup {

    void onSessionCleanup(String sessionId, boolean guest, List<String> connectionIds);
}
