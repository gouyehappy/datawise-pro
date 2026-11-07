package org.apache.datawise.backend.common.pack;

import org.apache.datawise.backend.domain.LineageGraphDto;
import org.apache.datawise.backend.domain.LineageImpactDto;

import java.io.IOException;

/**
 * Optional view-model lineage hooks. Implemented by datawise-lineage when present.
 */
public interface ViewModelLineageHooks {

    LineageGraphDto parseAndPersist(
                                    String connectionId,
                                    String instanceName,
                                    String fileName,
                                    String modelName,
                                    String sql,
                                    String dbType);

    void deleteSidecar(String connectionId, String instanceName, String name);

    LineageImpactDto findDownstreamImpact(String connectionId, String instanceName, String name) throws IOException;
}
