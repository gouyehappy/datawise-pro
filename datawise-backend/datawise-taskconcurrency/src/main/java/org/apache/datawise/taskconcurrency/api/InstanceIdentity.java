package org.apache.datawise.taskconcurrency.api;

/** 分布式部署时的实例标识（如 hostname + pid / K8s pod name） */
public interface InstanceIdentity
{
    String instanceId();
}
