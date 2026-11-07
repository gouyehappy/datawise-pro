package org.apache.datawise.backend.kubernetes;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;

/**
 * TLS helpers for Kubernetes API / exec clients.
 * When {@code insecureSkipTlsVerify} is enabled, both certificate and hostname checks are skipped
 * (equivalent to kubectl {@code --insecure-skip-tls-verify}).
 * <p>
 * Pod exec uses raw {@link SSLSocket} (not JDK {@code HttpClient} WebSocket): HttpClient still
 * enforces HTTPS hostname verification for {@code wss://} even with a trust-all SSLContext.
 */
public final class KubernetesTlsSupport {

    private static final X509TrustManager INSECURE_TRUST_MANAGER = new X509TrustManager() {
        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) {
        }

        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) {
        }

        @Override
        public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
        }
    };

    private static final HostnameVerifier INSECURE_HOSTNAME_VERIFIER = (hostname, session) -> true;

    private static final SSLContext INSECURE_SSL_CONTEXT = createInsecureSslContext();
    private static final SSLSocketFactory INSECURE_SOCKET_FACTORY = INSECURE_SSL_CONTEXT.getSocketFactory();

    private KubernetesTlsSupport() {
    }

    /** Trust-all manager exposed for clients that need an explicit {@link X509TrustManager}. */
    public static X509TrustManager insecureTrustManager() {
        return INSECURE_TRUST_MANAGER;
    }

    public static SSLSocketFactory insecureSocketFactory() {
        return INSECURE_SOCKET_FACTORY;
    }

    /**
     * Open a TCP or TLS socket to the API server.
     * TLS sockets from the insecure factory do <em>not</em> perform hostname verification
     * (unlike {@code java.net.http.HttpClient} WebSocket).
     */
    public static Socket openSocket(URI uri, boolean insecureSkipTlsVerify, int timeoutMs) throws IOException {
        if (uri.getHost() == null || uri.getHost().isBlank()) {
            throw new IOException("Kubernetes API URI missing host: " + uri);
        }
        int port = uri.getPort();
        if (port < 0) {
            port = "https".equalsIgnoreCase(uri.getScheme()) || "wss".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
        }
        boolean tls = "https".equalsIgnoreCase(uri.getScheme()) || "wss".equalsIgnoreCase(uri.getScheme());
        if (!tls) {
            Socket socket = new Socket();
            socket.connect(new InetSocketAddress(uri.getHost(), port), timeoutMs);
            socket.setSoTimeout(0);
            return socket;
        }
        if (insecureSkipTlsVerify) {
            SSLSocket ssl = (SSLSocket) INSECURE_SOCKET_FACTORY.createSocket();
            ssl.connect(new InetSocketAddress(uri.getHost(), port), timeoutMs);
            ssl.startHandshake();
            ssl.setSoTimeout(0);
            return ssl;
        }
        SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
        SSLSocket ssl = (SSLSocket) factory.createSocket();
        ssl.connect(new InetSocketAddress(uri.getHost(), port), timeoutMs);
        ssl.startHandshake();
        if (!HttpsURLConnection.getDefaultHostnameVerifier().verify(uri.getHost(), ssl.getSession())) {
            try {
                ssl.close();
            } catch (IOException ignored) {
                // ignore
            }
            throw new javax.net.ssl.SSLHandshakeException(
                    "No subject alternative DNS name matching " + uri.getHost() + " found");
        }
        ssl.setSoTimeout(0);
        return ssl;
    }

    /** Open an HTTP(S) connection; when insecure, trust-all + skip hostname verify. */
    public static HttpURLConnection openConnection(URI uri, boolean insecureSkipTlsVerify, int timeoutMs)
            throws IOException {
        URL url = uri.toURL();
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(timeoutMs);
        connection.setReadTimeout(timeoutMs);
        connection.setInstanceFollowRedirects(true);
        if (insecureSkipTlsVerify && connection instanceof HttpsURLConnection https) {
            https.setSSLSocketFactory(INSECURE_SOCKET_FACTORY);
            https.setHostnameVerifier(INSECURE_HOSTNAME_VERIFIER);
        }
        return connection;
    }

    public static String readBody(HttpURLConnection connection) throws IOException {
        InputStream stream;
        try {
            stream = connection.getInputStream();
        } catch (IOException ex) {
            stream = connection.getErrorStream();
            if (stream == null) {
                throw ex;
            }
        }
        try (InputStream in = stream) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    public static void writeBody(HttpURLConnection connection, String body) throws IOException {
        connection.setDoOutput(true);
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        try (OutputStream out = connection.getOutputStream()) {
            out.write(bytes);
        }
    }

    private static SSLContext createInsecureSslContext() {
        try {
            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(null, new TrustManager[]{INSECURE_TRUST_MANAGER}, new SecureRandom());
            return sslContext;
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to configure insecure TLS for Kubernetes client", ex);
        }
    }
}
