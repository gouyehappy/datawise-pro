Place Gudu commercial gsp.jar here as gsp.jar, then build with:

  mvn -Pwith-gsp -pl datawise-sqlflow

This module is self-contained: ANTLR grammar, AST, analyzer, and lineage API live under
datawise-backend/datawise-sqlflow (no dependency on datawise-components).

Default entry points:
  - SqlFlowLineageServices.createDefault()
  - SqlFlow.analyzeLineage(sql, dbTypeId)
