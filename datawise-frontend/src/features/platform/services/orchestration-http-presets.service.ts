export type OrchestrationHttpPresetId =
    | 'custom'
    | 'airflow_dag_run'
    | 'dbt_cloud_job'
    | 'prefect_flow_run'
    | 'dagster_job_launch'
    | 'generic_webhook'

export interface OrchestrationHttpPresetFields {
    httpUrl: string
    httpMethod: string
    httpBodyJson: string
    httpHeadersJson: string
    httpTimeoutMs: string
    httpStatusUrlTemplate: string
}

export interface OrchestrationHttpPreset {
    id: OrchestrationHttpPresetId
    /** i18n key under workspace.platformCatalog.form.httpPreset.* */
    labelKey: string
    fields: OrchestrationHttpPresetFields
}

const EMPTY_HEADERS = '{}'

export const ORCHESTRATION_HTTP_PRESETS: OrchestrationHttpPreset[] = [
    {
        id: 'custom',
        labelKey: 'custom',
        fields: {
            httpUrl: '',
            httpMethod: 'POST',
            httpBodyJson: '{}',
            httpHeadersJson: EMPTY_HEADERS,
            httpTimeoutMs: '10000',
            httpStatusUrlTemplate: '',
        },
    },
    {
        id: 'airflow_dag_run',
        labelKey: 'airflowDagRun',
        fields: {
            httpUrl: 'https://airflow.example/api/v1/dags/my_dag/dagRuns',
            httpMethod: 'POST',
            httpBodyJson: JSON.stringify(
                {conf: {}, note: 'Replace host/DAG id; capture dag_run_id from response'},
                null,
                2,
            ),
            httpHeadersJson: JSON.stringify(
                {Authorization: 'Basic <base64-user:pass>', 'Content-Type': 'application/json'},
                null,
                2,
            ),
            httpTimeoutMs: '15000',
            httpStatusUrlTemplate:
                'https://airflow.example/api/v1/dags/my_dag/dagRuns/{dag_run_id}',
        },
    },
    {
        id: 'dbt_cloud_job',
        labelKey: 'dbtCloudJob',
        fields: {
            httpUrl: 'https://cloud.getdbt.com/api/v2/accounts/<account_id>/jobs/<job_id>/run/',
            httpMethod: 'POST',
            httpBodyJson: JSON.stringify({cause: 'Triggered by DataWise'}, null, 2),
            httpHeadersJson: JSON.stringify(
                {Authorization: 'Token <dbt-cloud-token>', 'Content-Type': 'application/json'},
                null,
                2,
            ),
            httpTimeoutMs: '20000',
            httpStatusUrlTemplate: '',
        },
    },
    {
        id: 'prefect_flow_run',
        labelKey: 'prefectFlowRun',
        fields: {
            httpUrl: 'https://prefect.example/api/deployments/<deployment_id>/create_flow_run',
            httpMethod: 'POST',
            httpBodyJson: JSON.stringify(
                {parameters: {}, name: 'datawise-trigger'},
                null,
                2,
            ),
            httpHeadersJson: JSON.stringify(
                {Authorization: 'Bearer <prefect-api-key>', 'Content-Type': 'application/json'},
                null,
                2,
            ),
            httpTimeoutMs: '15000',
            httpStatusUrlTemplate: 'https://prefect.example/api/flow_runs/{run_id}',
        },
    },
    {
        id: 'dagster_job_launch',
        labelKey: 'dagsterJobLaunch',
        fields: {
            httpUrl: 'https://dagster.example/graphql',
            httpMethod: 'POST',
            httpBodyJson: JSON.stringify(
                {
                    query:
                        'mutation($selector: JobSelector!, $runConfigData: RunConfigData) {'
                        + ' launchRun(executionParams: { selector: $selector, runConfigData: $runConfigData }) {'
                        + ' __typename ... on LaunchRunSuccess { run { runId status } } } }',
                    variables: {
                        selector: {
                            repositoryLocationName: 'my_location',
                            repositoryName: '__repository__',
                            jobName: 'my_job',
                        },
                        runConfigData: {},
                    },
                },
                null,
                2,
            ),
            httpHeadersJson: JSON.stringify(
                {Authorization: 'Bearer <dagster-token>', 'Content-Type': 'application/json'},
                null,
                2,
            ),
            httpTimeoutMs: '20000',
            httpStatusUrlTemplate: '',
        },
    },
    {
        id: 'generic_webhook',
        labelKey: 'genericWebhook',
        fields: {
            httpUrl: 'https://hooks.example/run',
            httpMethod: 'POST',
            httpBodyJson: JSON.stringify({source: 'datawise', event: 'schedule'}, null, 2),
            httpHeadersJson: JSON.stringify({'Content-Type': 'application/json'}, null, 2),
            httpTimeoutMs: '10000',
            httpStatusUrlTemplate: '',
        },
    },
]

export function findOrchestrationHttpPreset(
    id: string | null | undefined,
): OrchestrationHttpPreset | undefined {
    if (!id) return undefined
    return ORCHESTRATION_HTTP_PRESETS.find((preset) => preset.id === id)
}

export function applyOrchestrationHttpPreset(
    id: OrchestrationHttpPresetId,
): OrchestrationHttpPresetFields {
    const preset = findOrchestrationHttpPreset(id) ?? ORCHESTRATION_HTTP_PRESETS[0]!
    return {...preset.fields}
}
