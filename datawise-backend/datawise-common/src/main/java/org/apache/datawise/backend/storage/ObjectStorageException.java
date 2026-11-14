package org.apache.datawise.backend.storage;

import java.io.IOException;

/** Checked failure from {@link ObjectStorageProvider} operations. */
public class ObjectStorageException extends IOException {

    public ObjectStorageException(String message) {
        super(message);
    }

    public ObjectStorageException(String message, Throwable cause) {
        super(message, cause);
    }
}
