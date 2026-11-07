package org.apache.datawise.backend.jdbc.ssh;

import com.jcraft.jsch.Session;
import com.jcraft.jsch.UIKeyboardInteractive;
import com.jcraft.jsch.UserInfo;

import java.util.Locale;

/**
 * JSch auth setup aligned with common desktop clients (Xshell, OpenSSH).
 * JumpServer advertises {@code password} first, then continues with
 * {@code keyboard-interactive} for the same credential — both must stay enabled.
 */
public final class SshJschAuthSupport {

    private SshJschAuthSupport() {
    }

    public static void configure(
            Session session,
            String username,
            String password,
            String keyPassphrase,
            boolean hasPrivateKey
    ) {
        String trimmedUsername = trimToNull(username);
        String trimmedPassword = trimToNull(password);
        String trimmedPassphrase = trimToNull(keyPassphrase);

        if (trimmedPassword != null) {
            session.setPassword(trimmedPassword);
        }
        session.setUserInfo(new InteractiveUserInfo(trimmedUsername, trimmedPassword, trimmedPassphrase));
        session.setConfig("PreferredAuthentications", preferredAuthentications(hasPrivateKey, trimmedPassword));
        session.setConfig("EnableAgent", "no");
        session.setConfig("IdentitiesOnly", "yes");
        if (!hasPrivateKey) {
            session.setConfig("PubkeyAuthentication", "no");
        }
    }

    static String preferredAuthentications(boolean hasPrivateKey, String password) {
        if (hasPrivateKey && password != null) {
            return "keyboard-interactive,password,publickey";
        }
        if (hasPrivateKey) {
            return "publickey,keyboard-interactive";
        }
        if (password != null) {
            // JumpServer: password round often fails first; keyboard-interactive completes login.
            return "password,keyboard-interactive";
        }
        return "keyboard-interactive,password,publickey";
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static final class InteractiveUserInfo implements UserInfo, UIKeyboardInteractive {

        private final String username;
        private final String password;
        private final String passphrase;

        private InteractiveUserInfo(String username, String password, String passphrase) {
            this.username = username;
            this.password = password;
            this.passphrase = passphrase;
        }

        @Override
        public String getPassphrase() {
            return passphrase;
        }

        @Override
        public String getPassword() {
            return password;
        }

        @Override
        public boolean promptPassword(String message) {
            return password != null;
        }

        @Override
        public boolean promptPassphrase(String message) {
            return passphrase != null;
        }

        @Override
        public boolean promptYesNo(String message) {
            return true;
        }

        @Override
        public void showMessage(String message) {
            // no interactive console in server-side connector
        }

        @Override
        public String[] promptKeyboardInteractive(
                String destination,
                String name,
                String instruction,
                String[] prompt,
                boolean[] echo
        ) {
            if (password == null || prompt == null || prompt.length == 0) {
                return null;
            }
            String[] response = new String[prompt.length];
            for (int i = 0; i < prompt.length; i++) {
                response[i] = keyboardInteractiveResponse(prompt[i], echo[i]);
            }
            return response;
        }

        private String keyboardInteractiveResponse(String promptLabel, boolean echo) {
            String label = promptLabel != null ? promptLabel.toLowerCase(Locale.ROOT) : "";
            if (echo) {
                if (username != null
                        && (label.contains("user")
                        || label.contains("login")
                        || label.contains("name")
                        || label.contains("用户")
                        || label.contains("账号"))) {
                    return username;
                }
                return "";
            }
            if (passphrase != null && (label.contains("passphrase") || label.contains("口令"))) {
                return passphrase;
            }
            return password;
        }
    }
}
