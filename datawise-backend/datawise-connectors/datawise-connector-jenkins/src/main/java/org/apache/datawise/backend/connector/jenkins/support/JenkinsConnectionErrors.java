package org.apache.datawise.backend.connector.jenkins.support;

import org.apache.datawise.backend.connector.support.ConnectorErrorSupport;
import org.apache.datawise.backend.connector.support.ConnectorErrorTemplate;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.Locale;

public final class JenkinsConnectionErrors {

    private static final ConnectorErrorTemplate TEMPLATE = new ConnectorErrorTemplate(
            "Jenkins",
            "Check Jenkins host, port, and network. Default protocol is HTTP; only set useHttps=true when TLS is real.",
            "Check Jenkins host, port, firewall/VPN, and that Jenkins is running.",
            "Check the hostname in connection settings.",
            "Check username and API token (password field) for Jenkins authentication.",
            "Check host/port, useHttps, and Jenkins availability.",
            lower -> lower.contains("401") || lower.contains("403") || lower.contains("unauthorized"),
            false
    );

    private JenkinsConnectionErrors() {
    }

    public static String toUserMessage(ConnectionEntity entity, Exception ex) {
        String root = rootMessage(ex);
        if (root != null) {
            String lower = root.toLowerCase(Locale.ROOT);
            if (lower.contains("plaintext") || lower.contains("unrecognized ssl")
                    || lower.contains("https was used but the server spoke plain http")) {
                return "Cannot connect to Jenkins with HTTPS: the endpoint is plain HTTP. "
                        + "Remove useHttps=true from advanced config (HTTP is the default), "
                        + "or configure a real TLS listener / correct HTTPS port. "
                        + "Details: " + root;
            }
            if (lower.contains("redirected http to https")) {
                return root;
            }
        }
        return ConnectorErrorSupport.toUserMessage(entity, ex, TEMPLATE);
    }

    private static String rootMessage(Throwable error) {
        Throwable current = error;
        String message = null;
        while (current != null) {
            if (current.getMessage() != null && !current.getMessage().isBlank()) {
                message = current.getMessage().trim();
            }
            current = current.getCause();
        }
        return message;
    }
}
