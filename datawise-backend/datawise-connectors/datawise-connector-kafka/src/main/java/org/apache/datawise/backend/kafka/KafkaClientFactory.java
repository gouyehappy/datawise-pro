package org.apache.datawise.backend.kafka;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.producer.ProducerConfig;

import java.util.Locale;
import java.util.Properties;
import java.util.UUID;

/** Builds Kafka client properties from {@link ConnectionEntity}. */
public final class KafkaClientFactory {

    private KafkaClientFactory() {
    }

    public static Properties adminProperties(ConnectionEntity entity) {
        Properties props = baseProperties(entity);
        props.put(AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, "10000");
        props.put(AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, "10000");
        return props;
    }

    public static Properties consumerProperties(ConnectionEntity entity) {
        Properties props = baseProperties(entity);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "datawise-peek-" + UUID.randomUUID());
        props.put(ConsumerConfig.CLIENT_ID_CONFIG, "datawise-peek");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest");
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, "100");
        props.put(ConsumerConfig.FETCH_MAX_WAIT_MS_CONFIG, "500");
        props.put(ConsumerConfig.REQUEST_TIMEOUT_MS_CONFIG, "10000");
        props.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, "10000");
        return props;
    }

    public static Properties producerProperties(ConnectionEntity entity) {
        Properties props = baseProperties(entity);
        props.put(ProducerConfig.ACKS_CONFIG, "1");
        return props;
    }

    static Properties baseProperties(ConnectionEntity entity) {
        Properties props = new Properties();
        props.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers(entity));
        applyAdvancedConfig(props, entity.getAdvancedConfig());
        applySasl(props, entity);
        return props;
    }

    static String bootstrapServers(ConnectionEntity entity) {
        if (entity == null) {
            return "localhost:9092";
        }
        String advanced = entity.getAdvancedConfig();
        if (advanced != null && !advanced.isBlank()) {
            for (String line : advanced.split("\\R")) {
                String trimmed = line.trim();
                if (trimmed.startsWith("bootstrap.servers=")) {
                    String value = trimmed.substring("bootstrap.servers=".length()).trim();
                    if (!value.isBlank()) {
                        return value;
                    }
                }
            }
        }
        String host = entity.getHost();
        if (host == null || host.isBlank()) {
            host = "localhost";
        }
        if (host.contains(",")) {
            return host.trim();
        }
        return host + ":" + parsePort(entity.getPort());
    }

    static void applyAdvancedConfig(Properties props, String advancedConfig) {
        if (advancedConfig == null || advancedConfig.isBlank()) {
            return;
        }
        for (String line : advancedConfig.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }
            int eq = trimmed.indexOf('=');
            if (eq <= 0) {
                continue;
            }
            String key = trimmed.substring(0, eq).trim();
            String value = trimmed.substring(eq + 1).trim();
            if (!key.isEmpty()) {
                props.put(key, value);
            }
        }
    }

    static void applySasl(Properties props, ConnectionEntity entity) {
        if (entity == null) {
            return;
        }
        String auth = entity.getAuthType();
        if (auth == null || auth.isBlank() || "NONE".equalsIgnoreCase(auth)) {
            return;
        }
        String username = entity.getUsername();
        String password = entity.getPassword();
        if (username == null || username.isBlank() || password == null) {
            return;
        }
        props.putIfAbsent("security.protocol", "SASL_PLAINTEXT");
        props.putIfAbsent("sasl.mechanism", "PLAIN");
        String mechanism = String.valueOf(props.get("sasl.mechanism"));
        String module = mechanism.toUpperCase(Locale.ROOT).startsWith("SCRAM")
                ? "org.apache.kafka.common.security.scram.ScramLoginModule"
                : "org.apache.kafka.common.security.plain.PlainLoginModule";
        String jaas = String.format(
                "%s required username=\"%s\" password=\"%s\";",
                module,
                escapeJaas(username),
                escapeJaas(password)
        );
        props.put("sasl.jaas.config", jaas);
    }

    static String escapeJaas(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    static int parsePort(String port) {
        if (port == null || port.isBlank()) {
            return 9092;
        }
        try {
            return Integer.parseInt(port.trim());
        } catch (NumberFormatException ex) {
            return 9092;
        }
    }
}
