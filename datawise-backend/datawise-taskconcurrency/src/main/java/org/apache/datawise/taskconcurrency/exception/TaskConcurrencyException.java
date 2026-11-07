package org.apache.datawise.taskconcurrency.exception;

/** 任务并发模块基础异常 */
public class TaskConcurrencyException extends RuntimeException
{
    public TaskConcurrencyException(String message)
    {
        super(message);
    }

    public TaskConcurrencyException(String message, Throwable cause)
    {
        super(message, cause);
    }
}
