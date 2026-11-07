package org.apache.datawise.taskconcurrency.exception;

/** 租户/全局策略变更校验失败 */
public class PolicyValidationException extends TaskConcurrencyException
{
    public PolicyValidationException(String message)
    {
        super(message);
    }
}
