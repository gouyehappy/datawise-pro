package org.apache.datawise.backend.connector.nacos.support;

import org.apache.datawise.backend.connector.support.ConnectorErrorSupport;
import org.apache.datawise.backend.connector.support.ConnectorErrorTemplate;
import org.apache.datawise.backend.model.ConnectionEntity;

public final class NacosConnectionErrors {

    private static final ConnectorErrorTemplate TEMPLATE = new ConnectorErrorTemplate(
            "Nacos",
            "Check Nacos host, port, contextPath (/nacos), and network. Default protocol is HTTP.",
            "Check Nacos host, port, firewall/VPN, and that Nacos is running.",
            "Check the hostname in connection settings.",
            "Check username and password for Nacos authentication (when auth is enabled).",
            "Check host/port, useHttps, contextPath, and Nacos availability.",
            lower -> lower.contains("401") || lower.contains("403") || lower.contains("unauthorized")
                    || lower.contains("accessToken"),
            false
    );

    private NacosConnectionErrors() {
    }

    public static String toUserMessage(ConnectionEntity entity, Exception ex) {
        return ConnectorErrorSupport.toUserMessage(entity, ex, TEMPLATE);
    }
}
