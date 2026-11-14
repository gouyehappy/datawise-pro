-- Shared login failure throttle (multi-instance; LoginAttemptGuard JDBC store)
CREATE TABLE dw_login_attempt (
    username_key VARCHAR(255) PRIMARY KEY,
    failures INT NOT NULL,
    first_failure_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);
