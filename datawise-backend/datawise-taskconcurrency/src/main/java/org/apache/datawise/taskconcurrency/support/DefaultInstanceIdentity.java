package org.apache.datawise.taskconcurrency.support;

import org.apache.datawise.taskconcurrency.api.InstanceIdentity;

import java.lang.management.ManagementFactory;
import java.net.InetAddress;
import java.util.UUID;

/**
 * 默认实例标识：{@code hostname:pid}。
 * 解析失败时退化为随机 UUID，保证租约 instanceId 非空。
 */
public final class DefaultInstanceIdentity implements InstanceIdentity
{
    private final String id;

    public DefaultInstanceIdentity()
    {
        this.id = buildId();
    }

    public DefaultInstanceIdentity(String id)
    {
        this.id = id;
    }

    @Override
    public String instanceId()
    {
        return id;
    }

    private static String buildId()
    {
        try {
            String host = InetAddress.getLocalHost().getHostName();
            String pid = ManagementFactory.getRuntimeMXBean().getName();
            return host + ":" + pid;
        } catch (Exception ex) {
            return "datawise-" + UUID.randomUUID();
        }
    }
}
