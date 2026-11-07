package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.SessionEntity;

import java.util.Optional;

/** Login sessions (file or jdbc backend). */
public interface SessionStore {

    Optional<SessionEntity> findById(String id);

    Optional<SessionEntity> authenticate(String id);

    SessionEntity save(SessionEntity session);

    SessionEntity create(SessionEntity session);

    SessionEntity renew(SessionEntity session);

    void deleteById(String id);

    /** Revoke all sessions for a user (IdP deprovision / force logout). */
    void deleteByUserId(long userId);

    void purgeExpired();
}
