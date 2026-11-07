package org.apache.datawise.backend.connector.mongodb.support;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoCollection;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.mongodb.MongoClientFactory;
import org.bson.Document;

import java.util.function.Function;

/** Shared MongoDB client lifecycle helpers. */
public final class MongoClientSupport {

    private MongoClientSupport() {
    }

    public static void requireDatabase(String database) {
        if (database == null || database.isBlank()) {
            throw new IllegalArgumentException("MongoDB database is required");
        }
    }

    public static void requireCollection(String collection) {
        if (collection == null || collection.isBlank()) {
            throw new IllegalArgumentException("MongoDB collection is required");
        }
    }

    public static <T> T withClient(ConnectionEntity entity, Function<MongoClient, T> action) {
        try (MongoClient client = MongoClientFactory.open(entity)) {
            return action.apply(client);
        }
    }

    public static <T> T withCollection(
            ConnectionEntity entity,
            String database,
            String collection,
            Function<MongoCollection<Document>, T> action
    ) {
        requireDatabase(database);
        requireCollection(collection);
        return withClient(entity, client -> action.apply(client.getDatabase(database).getCollection(collection)));
    }
}
