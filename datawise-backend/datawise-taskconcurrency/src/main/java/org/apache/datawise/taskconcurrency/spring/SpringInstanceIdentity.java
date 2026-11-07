package org.apache.datawise.taskconcurrency.spring;

import org.apache.datawise.taskconcurrency.api.InstanceIdentity;
import org.apache.datawise.taskconcurrency.support.DefaultInstanceIdentity;
import org.springframework.core.env.Environment;

import java.lang.management.ManagementFactory;
import java.net.InetAddress;

/**
 * 基于 Spring 环境的实例标识：{@code applicationName@host:pid}。
 */
public final class SpringInstanceIdentity implements InstanceIdentity
{
    private final String id;

    public SpringInstanceIdentity(Environment environment)
    {
        String appName = environment.getProperty("spring.application.name", "datawise");
        this.id = appName + "@" + resolveHostPid();
    }

    @Override
    public String instanceId()
    {
        return id;
    }

    private static String resolveHostPid()
    {
        try {
            String host = InetAddress.getLocalHost().getHostName();
            String pid = ManagementFactory.getRuntimeMXBean().getName();
            return host + ":" + pid;
        } catch (Exception ex) {
            return new DefaultInstanceIdentity().instanceId();
        }
    }
}
