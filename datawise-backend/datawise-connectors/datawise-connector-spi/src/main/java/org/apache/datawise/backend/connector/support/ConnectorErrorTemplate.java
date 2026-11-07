package org.apache.datawise.backend.connector.support;

import java.util.Locale;
import java.util.function.Predicate;

/** Product-specific hints for {@link ConnectorErrorSupport}. */
public record ConnectorErrorTemplate(
        String productName,
        String emptyRootHint,
        String unreachableHint,
        String unknownHostHint,
        String authHint,
        String fallbackHint,
        Predicate<String> authMatcher,
        boolean multiHostBootstrap) {

    public static ConnectorErrorTemplate kafka() {
        return new ConnectorErrorTemplate(
                "Kafka",
                "Check bootstrap servers, security settings, and network.",
                "Check bootstrap servers, firewall/VPN, and that brokers are running.",
                "Check bootstrap servers in connection settings.",
                "Check SASL/SSL settings in connection and advanced config.",
                "Check connection settings and broker availability.",
                lower -> lower.contains("authentication") || lower.contains("authorization")
                        || lower.contains("sasl") || lower.contains("ssl"),
                true);
    }

    public static ConnectorErrorTemplate redis() {
        return new ConnectorErrorTemplate(
                "Redis",
                "Check host, port, password, and network.",
                "Check host, port, firewall/VPN, and that Redis is running.",
                "Check the hostname in connection settings.",
                "Check username and password.",
                "Check connection settings and Redis service availability.",
                lower -> lower.contains("auth") || lower.contains("password") || lower.contains("noauth"),
                false);
    }

    public static ConnectorErrorTemplate mongodb() {
        return new ConnectorErrorTemplate(
                "MongoDB",
                "Check host, port, credentials, and network.",
                "Check host, port, firewall/VPN, and that MongoDB is running.",
                "Check the hostname in connection settings.",
                "Check username, password, and authSource.",
                "Check connection settings and MongoDB service availability.",
                lower -> lower.contains("auth") || lower.contains("authentication") || lower.contains("credentials"),
                false);
    }

    public static ConnectorErrorTemplate kudu() {
        return new ConnectorErrorTemplate(
                "Kudu",
                "Check Kudu master addresses, port 7051, and network.",
                "Check master host(s), firewall/VPN, and that Kudu masters/tservers are running.",
                "Check master addresses in connection settings.",
                null,
                "Check master addresses and Kudu cluster availability.",
                lower -> lower.contains("auth") || lower.contains("kerberos"),
                true);
    }
}
