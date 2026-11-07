package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.stereotype.Service;

import java.util.function.Supplier;

/**
 * 统一用户访问策略：访客只读/会话临时数据，注册用户可持久化。
 * <p>
 * 业务层应通过本类判断 guest 与持久化权限，避免散落 {@link UserContext#isGuest()}。
 */
@Service
public class UserAccessPolicy {

    public static final String GUEST_NOT_ALLOWED = "GUEST_NOT_ALLOWED";

    public void requireRegisteredUser() {
        if (isGuestSession()) {
            throw new IllegalArgumentException(GUEST_NOT_ALLOWED);
        }
    }

    public boolean isGuestSession() {
        return UserContext.isGuest();
    }

    public long requireUserId() {
        return UserContext.requireUserId();
    }

    /** 持久化写入前调用：必须是注册用户并返回 userId。 */
    public long requireRegisteredUserId() {
        requireRegisteredUser();
        return requireUserId();
    }

    public String requireSessionId() {
        String sessionId = UserContext.getSessionId();
        if (sessionId == null || sessionId.isBlank()) {
            throw new UnauthorizedException();
        }
        return sessionId;
    }

    /**
     * 访客走 ephemeral 分支；注册用户先校验再执行持久化分支。
     */
    public void runGuestEphemeralOrRegistered(Runnable guestAction, Runnable registeredAction) {
        if (isGuestSession()) {
            guestAction.run();
            return;
        }
        requireRegisteredUser();
        registeredAction.run();
    }

    public <T> T runGuestEphemeralOrRegistered(Supplier<T> guestAction, Supplier<T> registeredAction) {
        if (isGuestSession()) {
            return guestAction.get();
        }
        requireRegisteredUser();
        return registeredAction.get();
    }
}
