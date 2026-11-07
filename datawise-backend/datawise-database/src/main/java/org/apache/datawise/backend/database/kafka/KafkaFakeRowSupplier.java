package org.apache.datawise.backend.database.kafka;

import java.util.List;
import java.util.Map;

/** Generates fake table rows for Kafka publish (implemented by datagen module). */
public interface KafkaFakeRowSupplier {

    List<Map<String, Object>> generateRows(
            String connectionId,
            String database,
            String tableName,
            int rowCount,
            long seed,
            int rowOffset
    );
}
