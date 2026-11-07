package org.apache.datawise.backend.connector.yarn.support;

import org.apache.datawise.backend.connector.support.ConnectorErrorSupport;
import org.apache.datawise.backend.connector.support.ConnectorErrorTemplate;
import org.apache.datawise.backend.model.ConnectionEntity;

public final class YarnConnectionErrors {

    private static final ConnectorErrorTemplate TEMPLATE = new ConnectorErrorTemplate(
            "YARN",
            "Check Resource Manager host, port, and network.",
            "Check Resource Manager host, port, firewall/VPN, and that RM is running.",
            "Check the hostname in connection settings.",
            "Check username and password for RM web UI authentication.",
            "Check connection settings and Resource Manager availability.",
            lower -> lower.contains("401") || lower.contains("403") || lower.contains("unauthorized"),
            false
    );

    private YarnConnectionErrors() {
    }

    public static String toUserMessage(ConnectionEntity entity, Exception ex) {
        return ConnectorErrorSupport.toUserMessage(entity, ex, TEMPLATE);
    }
}
