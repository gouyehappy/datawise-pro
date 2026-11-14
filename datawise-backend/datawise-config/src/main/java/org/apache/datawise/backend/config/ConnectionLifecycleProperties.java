package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** JDBC 连接池与 Explorer 会话的空闲回收策略。 */
@ConfigurationProperties(prefix = "datawise.connection")
public class ConnectionLifecycleProperties {

    /** 是否启用长时间无操作后自动断开（回收 Hikari 池与 schema 会话）。 */
    private boolean idleEvictEnabled = true;

    /**
     * 距上次真实使用超过该时长则回收连接池（毫秒）。
     * 默认 30 分钟：桌面场景开会/看文档时不至于频繁断连；健康探测 ping 不计入活跃。
     */
    private long idleEvictMs = 1_800_000;

    /** 空闲回收扫描间隔（毫秒）。 */
    private long idleEvictPollMs = 60_000;

    /**
     * 进程内缓存的 JDBC 连接池上限；超出时按最近活跃时间 LRU 回收。
     * {@code 0} 表示不限制（仅依赖空闲回收）。
     */
    private int maxActivePools = 64;

    public boolean isIdleEvictEnabled() {
        return idleEvictEnabled;
    }

    public void setIdleEvictEnabled(boolean idleEvictEnabled) {
        this.idleEvictEnabled = idleEvictEnabled;
    }

    public long getIdleEvictMs() {
        return idleEvictMs;
    }

    public void setIdleEvictMs(long idleEvictMs) {
        this.idleEvictMs = Math.max(60_000, idleEvictMs);
    }

    public long getIdleEvictPollMs() {
        return idleEvictPollMs;
    }

    public void setIdleEvictPollMs(long idleEvictPollMs) {
        this.idleEvictPollMs = Math.max(15_000, idleEvictPollMs);
    }

    public int getMaxActivePools() {
        return maxActivePools;
    }

    public void setMaxActivePools(int maxActivePools) {
        this.maxActivePools = Math.max(0, maxActivePools);
    }
}
