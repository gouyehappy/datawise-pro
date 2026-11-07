import {datasourcesApi} from '@/api'
import type {
    DatasourceCatalogBundle,
    DatasourceDefinition,
    JdbcDriverResolveResult,
} from '@/features/datasource/types/datasource.types'

export async function fetchDatasourceCatalogBundle(): Promise<DatasourceCatalogBundle> {
    const data = await datasourcesApi.list()
    return {
        datasources: data.datasources,
        loadedPluginJars: data.loadedPluginJars ?? [],
        pluginLoadFailures: data.pluginLoadFailures ?? [],
    }
}

export async function fetchDatasourceCatalog(): Promise<DatasourceDefinition[]> {
    const bundle = await fetchDatasourceCatalogBundle()
    return bundle.datasources
}

export async function resolveJdbcDriver(
    mavenCoordinates: string,
    driverClass: string,
): Promise<JdbcDriverResolveResult> {
    return datasourcesApi.resolveDriver(mavenCoordinates, driverClass)
}

export function datasourceLabel(
    catalog: DatasourceDefinition[],
    id: string,
): string {
    return catalog.find((item) => item.id === id)?.label ?? id
}

export function findDatasource(
    catalog: DatasourceDefinition[],
    id: string,
): DatasourceDefinition | undefined {
    return catalog.find((item) => item.id === id)
}
