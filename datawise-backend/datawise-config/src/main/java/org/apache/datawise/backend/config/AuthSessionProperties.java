package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "datawise.auth.session")
public class AuthSessionProperties {

    /**
     * 会话有效时长（分钟），登录后默认 1 小时；使用中可滑动续期。
     */
    private int ttlMinutes = 60;

    /**
     * 每次带有效 session 的请求是否延长过期时间。
     */
    private boolean slidingRenewal = true;

    public int getTtlMinutes() {
        return Math.max(5, ttlMinutes);
    }

    public void setTtlMinutes(int ttlMinutes) {
        this.ttlMinutes = ttlMinutes;
    }

    public boolean isSlidingRenewal() {
        return slidingRenewal;
    }

    public void setSlidingRenewal(boolean slidingRenewal) {
        this.slidingRenewal = slidingRenewal;
    }
}
