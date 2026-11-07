package org.apache.datawise.backend.database.federated;

import org.apache.datawise.backend.domain.GenerateFederatedSqlRequest;
import org.apache.datawise.backend.domain.GenerateFederatedSqlResult;

/** Optional AI federated SQL generator; provided by datawise-ai when present. */
public interface FederatedSqlGenerator {

    GenerateFederatedSqlResult generate(GenerateFederatedSqlRequest request);
}
