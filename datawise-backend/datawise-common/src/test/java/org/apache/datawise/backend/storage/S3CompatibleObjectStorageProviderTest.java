package org.apache.datawise.backend.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectResponse;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class S3CompatibleObjectStorageProviderTest {

    @Mock
    private S3Client client;

    @Mock
    private S3Presigner presigner;

    @Test
    void putGetExistsDeleteAndPresignViaClient() throws Exception {
        S3CompatibleObjectStorageProvider storage = newStorage();
        ObjectStorageKey key = ObjectStorageKey.of("a.bin");
        byte[] payload = "hello".getBytes(StandardCharsets.UTF_8);

        when(client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenReturn(PutObjectResponse.builder().build());
        storage.put(key, new ByteArrayInputStream(payload), payload.length, "text/plain");

        ArgumentCaptor<PutObjectRequest> putCaptor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(client).putObject(putCaptor.capture(), any(RequestBody.class));
        assertEquals("datawise", putCaptor.getValue().bucket());
        assertEquals("a.bin", putCaptor.getValue().key());
        assertEquals("text/plain", putCaptor.getValue().contentType());
        assertEquals(payload.length, putCaptor.getValue().contentLength());

        when(client.headObject(any(HeadObjectRequest.class)))
                .thenReturn(HeadObjectResponse.builder().build());
        assertTrue(storage.exists(key));

        when(client.headObject(any(HeadObjectRequest.class)))
                .thenThrow(NoSuchKeyException.builder().message("missing").build());
        assertFalse(storage.exists(ObjectStorageKey.of("missing.bin")));

        ResponseInputStream<GetObjectResponse> responseStream = new ResponseInputStream<>(
                GetObjectResponse.builder().build(),
                AbortableInputStream.create(new ByteArrayInputStream(payload))
        );
        when(client.getObject(any(GetObjectRequest.class))).thenReturn(responseStream);
        try (InputStream in = storage.get(key)) {
            assertEquals("hello", new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }

        PresignedGetObjectRequest signed = mock(PresignedGetObjectRequest.class);
        when(signed.url()).thenReturn(URI.create("http://127.0.0.1:9000/datawise/a.bin?X-Amz-Signature=x").toURL());
        when(presigner.presignGetObject(any(GetObjectPresignRequest.class))).thenReturn(signed);
        URI uri = storage.presignGet(key, Duration.ofMinutes(5));
        assertEquals("http://127.0.0.1:9000/datawise/a.bin?X-Amz-Signature=x", uri.toString());

        storage.delete(key);
        ArgumentCaptor<DeleteObjectRequest> deleteCaptor = ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(client).deleteObject(deleteCaptor.capture());
        assertEquals("a.bin", deleteCaptor.getValue().key());

        assertEquals(S3CompatibleObjectStorageProvider.ID, storage.id());
        assertEquals("datawise", storage.resolveBucket(ObjectStorageKey.of("z")));
        storage.close();
    }

    @Test
    void getMapsMissingKey() {
        S3CompatibleObjectStorageProvider storage = newStorage();
        when(client.getObject(any(GetObjectRequest.class)))
                .thenThrow(NoSuchKeyException.builder().message("gone").build());
        ObjectStorageException ex = assertThrows(
                ObjectStorageException.class,
                () -> storage.get(ObjectStorageKey.of("gone.bin"))
        );
        assertTrue(ex.getMessage().contains("not found"));
    }

    @Test
    void requiresEndpoint() {
        assertThrows(
                IllegalArgumentException.class,
                () -> new S3CompatibleObjectStorageProvider("", "r", "a", "s", "b", true)
        );
    }

    @Test
    void requiresBucket() {
        S3CompatibleObjectStorageProvider storage = new S3CompatibleObjectStorageProvider(
                "http://127.0.0.1:9000",
                "us-east-1",
                "minio",
                "minio123",
                "",
                true,
                client,
                presigner
        );
        assertThrows(
                ObjectStorageException.class,
                () -> storage.resolveBucket(ObjectStorageKey.of("a.bin"))
        );
    }

    private S3CompatibleObjectStorageProvider newStorage() {
        return new S3CompatibleObjectStorageProvider(
                "http://127.0.0.1:9000",
                "us-east-1",
                "minio",
                "minio123",
                "datawise",
                true,
                client,
                presigner
        );
    }
}
