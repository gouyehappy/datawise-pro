package org.apache.datawise.taskconcurrency.model;

/** 任务在池中的生命周期状态 */
public enum TaskPoolStatus
{
    /** 等待调度 */
    PENDING,
    /** 已分配卡槽、执行中，等待 ack 后才从池中删除 */
    DISPATCHED
}
