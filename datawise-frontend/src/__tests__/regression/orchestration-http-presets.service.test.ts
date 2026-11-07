import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    applyOrchestrationHttpPreset,
    findOrchestrationHttpPreset,
    ORCHESTRATION_HTTP_PRESETS,
} from '@/features/platform/services/orchestration-http-presets.service'

describe('orchestration-http-presets.service', () => {
    it('lists airflow / dbt / prefect / dagster / generic presets', () => {
        const ids = ORCHESTRATION_HTTP_PRESETS.map((preset) => preset.id)
        assert.deepEqual(ids, [
            'custom',
            'airflow_dag_run',
            'dbt_cloud_job',
            'prefect_flow_run',
            'dagster_job_launch',
            'generic_webhook',
        ])
    })

    it('applies airflow dag-run preset with statusUrlTemplate', () => {
        const fields = applyOrchestrationHttpPreset('airflow_dag_run')
        assert.equal(fields.httpMethod, 'POST')
        assert.match(fields.httpUrl, /dagRuns/)
        assert.match(fields.httpStatusUrlTemplate, /\{dag_run_id\}/)
    })

    it('applies prefect flow-run preset with statusUrlTemplate', () => {
        const fields = applyOrchestrationHttpPreset('prefect_flow_run')
        assert.match(fields.httpUrl, /create_flow_run/)
        assert.match(fields.httpStatusUrlTemplate, /\{run_id\}/)
    })

    it('finds presets by id', () => {
        assert.equal(findOrchestrationHttpPreset('dbt_cloud_job')?.labelKey, 'dbtCloudJob')
        assert.equal(findOrchestrationHttpPreset('dagster_job_launch')?.labelKey, 'dagsterJobLaunch')
        assert.equal(findOrchestrationHttpPreset('missing'), undefined)
    })
})
