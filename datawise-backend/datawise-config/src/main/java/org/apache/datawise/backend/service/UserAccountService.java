package org.apache.datawise.backend.service;

import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.stereotype.Service;

@Service
public class UserAccountService {

    private final UserStore userStore;

    public UserAccountService(UserStore userStore) {
        this.userStore = userStore;
    }

    /**
     * 当前请求会话用户；无有效会话时抛出 {@code UNAUTHORIZED}。
     * 会话由 server 层 {@code SessionAuthFilter} 从
     * {@code X-DW-Session-Id} 解析并写入 {@link UserContext}。
     */
    public Long requireUserId() {
        return UserContext.requireUserId();
    }

    public UserEntity resolveUserProfile(String username, boolean guest) {
        return userStore.findByUsername(username)
                .orElseGet(() -> {
                    UserEntity fallback = new UserEntity();
                    fallback.setUsername(username);
                    fallback.setDisplayName(username);
                    fallback.setEmail(username + "@datawise.local");
                    fallback.setGuest(guest);
                    return fallback;
                });
    }

    public String resolveUserName(Long userId) {
        if (userId == null) {
            return "unknown";
        }
        return userStore.findById(userId)
                .map(user -> user.getDisplayName() != null && !user.getDisplayName().isBlank()
                        ? user.getDisplayName()
                        : user.getUsername())
                .orElse("user-" + userId);
    }
}
