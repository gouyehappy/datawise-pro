package org.apache.datawise.backend.connector.mongodb;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

@AutoConfiguration
@ConditionalOnClass(name = "com.mongodb.client.MongoClient")
public class MongoConnectorAutoConfiguration {

    @Bean
    MongoConnectorOperations mongoConnectorOperations() {
        return new MongoConnectorOperations();
    }

    @Bean
    MongoDataSourceConnector mongoDataSourceConnector(MongoConnectorOperations mongo) {
        return new MongoDataSourceConnector(mongo);
    }
}
