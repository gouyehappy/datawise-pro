package org.apache.datawise.backend.connector.polaris.support;

import org.apache.datawise.backend.connector.support.ConnectorErrorSupport;
import org.apache.datawise.backend.connector.support.ConnectorErrorTemplate;
import org.apache.datawise.backend.model.ConnectionEntity;

public final class PolarisConnectionErrors {

    private static final ConnectorErrorTemplate TEMPLATE = new ConnectorErrorTemplate(
            "Polaris",
            "Check Polaris host, port (8090), token, and network. Default protocol is HTTP.",
            "Check Polaris host, port, firewall/VPN, and that Polaris console is reachable.",
            "Check the hostname in connection settings.",
            "Check X-Polaris-Token (advanced token= or password field).",
            "Check host/port, useHttps, token, and Polaris availability.",
            lower -> lower.contains("401") || lower.contains("403") || lower.contains("unauthorized")
                    || lower.contains("token"),
            false
    );

    private PolarisConnectionErrors() {
    }

    public static String toUserMessage(ConnectionEntity entity, Exception ex) {
        return ConnectorErrorSupport.toUserMessage(entity, ex, TEMPLATE);
    }
}
