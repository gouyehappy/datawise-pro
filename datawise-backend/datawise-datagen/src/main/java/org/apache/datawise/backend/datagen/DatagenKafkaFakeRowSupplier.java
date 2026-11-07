package org.apache.datawise.backend.datagen;

import org.apache.datawise.backend.database.kafka.KafkaFakeRowSupplier;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class DatagenKafkaFakeRowSupplier implements KafkaFakeRowSupplier {

    private final DatagenService datagenService;

    public DatagenKafkaFakeRowSupplier(DatagenService datagenService) {
        this.datagenService = datagenService;
    }

    @Override
    public List<Map<String, Object>> generateRows(
            String connectionId,
            String database,
            String tableName,
            int rowCount,
            long seed,
            int rowOffset
    ) {
        return datagenService.generateRows(connectionId, database, tableName, rowCount, seed, rowOffset);
    }
}
