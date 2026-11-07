package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.ApiTokenEntity;

import java.util.List;
import java.util.Optional;

/** API tokens (file or jdbc backend). */
public interface ApiTokenStore {

    List<ApiTokenEntity> listAll();

    Optional<ApiTokenEntity> findById(String id);

    Optional<ApiTokenEntity> findByTokenLookup(String tokenLookup);

    ApiTokenEntity save(ApiTokenEntity token);
}
