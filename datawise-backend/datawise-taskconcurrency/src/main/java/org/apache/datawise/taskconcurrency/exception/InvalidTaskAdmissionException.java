package org.apache.datawise.taskconcurrency.exception;

/** 任务入池参数非法 */
public class InvalidTaskAdmissionException extends TaskConcurrencyException
{
    public InvalidTaskAdmissionException(String message)
    {
        super(message);
    }
}
