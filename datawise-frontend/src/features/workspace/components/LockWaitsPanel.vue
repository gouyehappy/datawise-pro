<script setup lang="ts">

import {computed, inject, onMounted, ref, toRef, watch} from 'vue'

import {useI18n} from 'vue-i18n'

import LockWaitChainTree from '@/features/workspace/components/LockWaitChainTree.vue'
import {EmptyState} from '@/core/components'
import {ContextMenuHost} from '@/core/context-menu'

import {sessionKillKey} from '@/features/workspace/composables/session-kill-context'
import {useMonitorSessionSqlMenu} from '@/features/workspace/composables/useMonitorSessionSqlMenu'
import {sqlApi} from '@/api'
import type {DbType} from '@/core/types'
import {
    buildBlockingChains,
    type LockWaitList,
} from '@/features/workspace/services/lock-waits.service'
import type {SessionKillMode} from '@/shared/api/types'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'



const props = withDefaults(defineProps<{

  connectionId?: string

  database?: string

  dbType?: DbType

  embedded?: boolean

}>(), {

  embedded: false,

})



const emit = defineEmits<{

  openSql: [sql: string]

}>()



const {t} = useI18n()
const entitlement = useEntitlementStore()

const loading = ref(false)

const data = ref<LockWaitList | null>(null)



const i18nPrefix = computed(() => 'shortcut.lockWaits')

const sessionKill = inject(sessionKillKey)

const canKill = computed(() => sessionKill?.canKill.value ?? false)

const killingSessionId = computed(() => sessionKill?.killingSessionId.value ?? null)

const canLoad = computed(() => Boolean(props.connectionId?.trim()))

const chains = computed(() => buildBlockingChains(data.value?.edges ?? []))

const edgeCount = computed(() => data.value?.edges.length ?? 0)

const {
  menuVisible,
  menuPos,
  menuItems,
  onContextMenu,
  onMenuSelect,
  closeMenu,
} = useMonitorSessionSqlMenu({
  connectionId: toRef(props, 'connectionId'),
  database: toRef(props, 'database'),
  dbType: toRef(props, 'dbType'),
})



async function loadLockWaits() {

  if (!canLoad.value) {

    data.value = null

    return

  }

  if (!entitlement.guardPack('pack.dataops', 'lock.analysis')) {

    data.value = null

    return

  }

  loading.value = true

  try {

    data.value = await sqlApi.fetchLockWaits({

      connectionId: props.connectionId!.trim(),

      database: props.database,

    })

  } catch {

    data.value = {edges: [], supported: false, message: t(`${i18nPrefix.value}.loadFailed`)}

  } finally {

    loading.value = false

  }

}



function openSql(sql: string) {

  const trimmed = sql.trim()

  if (!trimmed) return

  emit('openSql', trimmed)

}



function onKillSession(sessionId: string, mode: SessionKillMode) {

  sessionKill?.requestKill(sessionId, mode, loadLockWaits)

}



onMounted(() => {

  void loadLockWaits()

})



watch(() => [props.connectionId, props.database], () => {

  void loadLockWaits()

})

</script>



<template>

  <section class="lock-waits" :class="{ 'lock-waits--embedded': embedded }">

    <header class="lock-waits__head">

      <div>

        <h2 class="lock-waits__title">{{ t(`${i18nPrefix}.title`) }}</h2>

        <p class="lock-waits__hint">

          {{ canLoad ? t(`${i18nPrefix}.subtitle`, {count: edgeCount}) : t(`${i18nPrefix}.noConnection`) }}

        </p>

      </div>

      <button

          class="dw-text-btn"

          type="button"

          :disabled="loading || !canLoad"

          @click="loadLockWaits"

      >

        {{ loading ? t(`${i18nPrefix}.loading`) : t(`${i18nPrefix}.refresh`) }}

      </button>

    </header>



    <EmptyState v-if="!canLoad" embedded bordered :title="t(`${i18nPrefix}.noConnection`)"/>

    <EmptyState v-else-if="loading && !data" embedded bordered :title="t(`${i18nPrefix}.loading`)"/>

    <EmptyState
        v-else-if="!data?.supported"
        embedded
        bordered
        :title="data?.message || t(`${i18nPrefix}.unsupported`)"
    />

    <EmptyState v-else-if="!chains.length" embedded bordered :title="t(`${i18nPrefix}.empty`)"/>

    <ul v-else class="lock-waits__chains">

      <li v-for="chain in chains" :key="chain.sessionId" class="lock-waits__chain">

        <LockWaitChainTree

            :node="chain"

            :depth="0"

            :can-kill="canKill"

            :killing-session-id="killingSessionId"

            @open-sql="openSql"

            @contextmenu-sql="onContextMenu"

            @kill="onKillSession"

        />

      </li>

    </ul>

    <ContextMenuHost
        :visible="menuVisible"
        :x="menuPos.x"
        :y="menuPos.y"
        :items="menuItems"
        @select="onMenuSelect"
        @close="closeMenu"
    />

  </section>

</template>



<style scoped>

.lock-waits {

  display: flex;

  flex-direction: column;

  gap: var(--dw-gap-md);

}



.lock-waits--embedded .lock-waits__title {

  font-size: var(--dw-text-md);

}



.lock-waits__head {

  display: flex;

  align-items: flex-start;

  justify-content: space-between;

  gap: var(--dw-gap-md);

}



.lock-waits__title {

  margin: 0;

  font-size: var(--dw-text-xl);

  font-weight: 600;

}



.lock-waits__hint {

  margin: var(--dw-space-2) 0 0;

  color: var(--dw-text-muted);

  font-size: var(--dw-text-xs);

  line-height: var(--dw-leading);

}









.lock-waits__chains {

  display: flex;

  flex-direction: column;

  gap: var(--dw-gap-md);

  margin: 0;

  padding: 0;

  list-style: none;

}



.lock-waits__chain {

  padding: var(--dw-space-4);

  border: 1px solid var(--dw-border-light);

  border-radius: var(--dw-panel-radius);

  background: color-mix(in srgb, var(--dw-primary) 3%, var(--dw-bg));

}

</style>
