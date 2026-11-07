package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.SqlHistoryEntity;

import java.util.List;

/** Global SQL execution history (file or jdbc backend). */
public interface SqlHistoryStore {

    List<SqlHistoryEntity> findByUserId(Long userId);

    List<SqlHistoryEntity> findByUserIds(List<Long> userIds);

    SqlHistoryEntity save(SqlHistoryEntity entity);
}
