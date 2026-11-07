import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import {datasourcesApi} from '@/api'
import type {JdbcDriverDownloadProgress} from '@/features/datasource/types/datasource.types'
import {t} from '@/i18n'
import {resolveCaughtApiErrorMessage} from '@/shared/api'

export type DriverInstallOutcome = 'cached' | 'installed' | 'cancelled' | 'failed'

export function jdbcArtifactName(mavenCoordinates: string): string {
    const parts = mavenCoordinates.split(':').map((part) => part.trim()).filter(Boolean)
    if (parts.length >= 2) return parts[1]
    return mavenCoordinates.trim() || 'JDBC'
}

export const useDriverInstallStore = defineStore('driver-install', () => {
    const open = ref(false)
    const label = ref('')
    const maven = ref('')
    const downloadedBytes = ref(0)
    const totalBytes = ref(0)
    const error = ref<string | null>(null)
    const installing = ref(false)
    let cancelled = false
    let inflight: Promise<DriverInstallOutcome> | null = null

    const percent = computed(() => {
        if (totalBytes.value <= 0) return null
        return Math.min(100, Math.round((downloadedBytes.value / totalBytes.value) * 100))
    })

    function applySnapshot(snapshot: JdbcDriverDownloadProgress) {
        downloadedBytes.value = Math.max(0, snapshot.downloadedBytes ?? 0)
        if ((snapshot.totalBytes ?? 0) > 0) totalBytes.value = snapshot.totalBytes
        if (snapshot.error && !snapshot.active) error.value = snapshot.error
    }

    function cancel() {
        cancelled = true
        open.value = false
        installing.value = false
    }

    function dismiss() {
        if (installing.value) {
            cancel()
            return
        }
        open.value = false
        error.value = null
    }

    async function ensure(
        mavenCoordinates: string,
        driverClass: string,
        displayLabel?: string,
    ): Promise<DriverInstallOutcome> {
        const coordinates = mavenCoordinates.trim()
        const driver = driverClass.trim()
        if (!coordinates || !driver) return 'failed'
        try {
            const snapshot = await datasourcesApi.driverProgress(coordinates)
            if (snapshot.cached && !snapshot.active) return 'cached'
        } catch {
            // Cache probe failed; still try install so the user sees the modal.
        }
        if (inflight) return inflight

        cancelled = false
        error.value = null
        downloadedBytes.value = 0
        totalBytes.value = 0
        label.value = displayLabel?.trim() || jdbcArtifactName(coordinates)
        maven.value = coordinates
        open.value = true
        installing.value = true

        inflight = runInstall(coordinates, driver).finally(() => {
            inflight = null
            installing.value = false
        })
        return inflight
    }

    async function runInstall(coordinates: string, driver: string): Promise<DriverInstallOutcome> {
        const timer = window.setInterval(() => {
            void datasourcesApi.driverProgress(coordinates).then((snapshot) => {
                if (cancelled) return
                applySnapshot(snapshot)
            }).catch(() => undefined)
        }, 400)
        try {
            await datasourcesApi.installDriver(coordinates, driver)
            if (cancelled) return 'cancelled'
            try {
                applySnapshot(await datasourcesApi.driverProgress(coordinates))
            } catch {
                // Install already succeeded.
            }
            open.value = false
            return 'installed'
        } catch (err) {
            if (cancelled) return 'cancelled'
            error.value = resolveCaughtApiErrorMessage(err, t, 'connection.driverInstallFailed')
            return 'failed'
        } finally {
            window.clearInterval(timer)
        }
    }

    return {
        open,
        label,
        maven,
        downloadedBytes,
        totalBytes,
        percent,
        error,
        installing,
        cancel,
        dismiss,
        ensure,
    }
})
