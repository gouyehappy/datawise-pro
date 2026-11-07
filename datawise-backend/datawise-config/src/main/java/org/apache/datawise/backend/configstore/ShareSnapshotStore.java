package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.ShareSnapshotEntity;

import java.util.List;
import java.util.Optional;

/** Frozen share snapshots (file or jdbc). */
public interface ShareSnapshotStore {

    List<ShareSnapshotEntity> listAll();

    Optional<ShareSnapshotEntity> findById(String id);

    Optional<ShareSnapshotEntity> findByTokenLookup(String tokenLookup);

    ShareSnapshotEntity save(ShareSnapshotEntity entity);

    void delete(String id);
}
