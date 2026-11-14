package org.apache.datawise.backend.service.auth;

import java.util.concurrent.ConcurrentHashMap;

/** Process-local login throttle store (desktop / file metadata). */
public class MemoryLoginAttemptStore implements LoginAttemptStore {

    private final ConcurrentHashMap<String, AttemptWindow> attempts = new ConcurrentHashMap<>();

    @Override
    public AttemptWindow find(String usernameKey) {
        return attempts.get(usernameKey);
    }

    @Override
    public void save(String usernameKey, AttemptWindow window) {
        attempts.put(usernameKey, window);
    }

    @Override
    public void delete(String usernameKey) {
        attempts.remove(usernameKey);
    }
}
