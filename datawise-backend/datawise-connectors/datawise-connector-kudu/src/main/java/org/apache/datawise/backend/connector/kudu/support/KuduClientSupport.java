package org.apache.datawise.backend.connector.kudu.support;

import org.apache.datawise.backend.kudu.KuduClientFactory;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.kudu.client.KuduClient;
import org.apache.kudu.client.KuduException;

/** Shared Kudu client lifecycle helpers. */
public final class KuduClientSupport {

    private KuduClientSupport() {
    }

    public static <T> T withClient(ConnectionEntity entity, ThrowingFunction<KuduClient, T> action) {
        KuduClient client = KuduClientFactory.open(entity);
        try {
            return action.apply(client);
        } catch (KuduException ex) {
            throw new IllegalStateException(ex.getMessage(), ex);
        } finally {
            try {
                client.close();
            } catch (Exception ignored) {
                // best effort
            }
        }
    }

    @FunctionalInterface
    public interface ThrowingFunction<T, R> {
        R apply(T value) throws KuduException;
    }
}
