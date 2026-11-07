package org.apache.datawise.backend.service.auth;

import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.startup.DesktopDeferredStartup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Warns when shipped sample password hashes are still present in {@code users.json}.
 * The bcrypt in {@code users.json.example} is public; production must rotate those accounts.
 */
@Component
@Order(50)
public class DefaultCredentialsStartupWarning implements ApplicationRunner {

    /** bcrypt from {@code config/users.json.example} (admin/demo sample). */
    public static final String SHIPPED_SAMPLE_PASSWORD_HASH =
            "$2a$10$PVBxsdqQtjLCo2DCcm5kt.efYZNzqA9qq9lsDWZ2zRNKRL4Hw54D.";

    private static final Logger log = LoggerFactory.getLogger(DefaultCredentialsStartupWarning.class);

    private final UserStore userStore;

    public DefaultCredentialsStartupWarning(UserStore userStore) {
        this.userStore = userStore;
    }

    @Override
    public void run(ApplicationArguments args) {
        DesktopDeferredStartup.runMaybeAsync("default-creds-warn", this::warnSync);
    }

    private void warnSync() {
        int count = 0;
        for (UserEntity user : userStore.listAllUsers()) {
            if (user == null || user.isGuest()) {
                continue;
            }
            String hash = user.getPasswordHash();
            if (hash != null && hash.equals(SHIPPED_SAMPLE_PASSWORD_HASH)) {
                count++;
                log.warn(
                        "User '{}' still uses the shipped sample password hash — change it before exposing this instance",
                        user.getUsername());
            }
        }
        if (count > 0) {
            log.warn(
                    "Detected {} account(s) with the public sample password hash from users.json.example",
                    count);
        }
    }
}
