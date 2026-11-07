<script setup lang="ts">
import {ref, watch} from 'vue'
import {
  applyTheme,
  DEFAULT_THEME_PREFERENCES,
  DwButton,
  DwCard,
  DwSegment,
  EmptyState,
  StatusPill,
  DwFormDialog,
  DwBrowseToolbar,
  DwPhIcon,
  DwInput,
  DwToolbarButton,
  DwSplitPane,
  TabBar,
  TabItem,
  TabAddButton,
  AppToast,
  useDwToast,
  type UiSkin,
} from '@datawise/framework'
import {DwDataGrid, type DwDataGridColumn} from '@datawise/framework/data-grid'
import {DwCodeViewer} from '@datawise/framework/code'

type DemoRow = {id: string; name: string; status: string}

const dark = ref(false)
const skin = ref<UiSkin>('classic')
const query = ref('')
const formOpen = ref(false)
const name = ref('')
const toast = useDwToast()
const gridSelected = ref<string[]>([])
const segmentPill = ref('table')
const segmentLine = ref('overview')
const activeTab = ref('sql')
const demoTabs = [
  {id: 'sql', title: 'orders.sql'},
  {id: 'schema', title: 'Schema'},
  {id: 'logs', title: 'Logs'},
]

const skins: Array<{id: UiSkin; label: string; hint: string}> = [
  {id: 'classic', label: 'Classic', hint: 'Card shell, soft radii'},
  {id: 'ide', label: 'IDE', hint: 'Flush workbench, strip tabs'},
  {id: 'atelier', label: 'Atelier', hint: 'Airy studio gutters'},
  {id: 'ledger', label: 'Ledger', hint: 'Sharp blueprint seams'},
]

const pillTabs = [
  {id: 'table', label: 'Table'},
  {id: 'chart', label: 'Chart', count: 3},
  {id: 'raw', label: 'Raw'},
]

const lineTabs = [
  {id: 'overview', label: 'Overview'},
  {id: 'schema', label: 'Schema'},
  {id: 'history', label: 'History'},
]

const gridRows = ref<DemoRow[]>([
  {id: '1', name: 'orders', status: 'ready'},
  {id: '2', name: 'customers', status: 'syncing'},
  {id: '3', name: 'events', status: 'ready'},
])

const gridColumns: DwDataGridColumn<DemoRow>[] = [
  {key: 'name', label: 'Name'},
  {key: 'status', label: 'Status', mono: true},
]

const sampleSql = `SELECT id, name, status
FROM resources
WHERE status = 'ready'
ORDER BY name;`

const skinHint = ref(skins[0].hint)

function applyPlaygroundTheme() {
  applyTheme({
    ...DEFAULT_THEME_PREFERENCES,
    appearance: dark.value ? 'dark' : 'light',
    uiSkin: skin.value,
    uiDensity: 'md',
    uiTextScale: 'md',
  })
  skinHint.value = skins.find((item) => item.id === skin.value)?.hint ?? ''
}

watch([dark, skin], applyPlaygroundTheme, {immediate: true})

function onSave() {
  formOpen.value = false
  toast.success(`Saved “${name.value || 'untitled'}”`)
}
</script>

<template>
  <div class="pg">
    <header>
      <h1 class="pg__brand">DataWise UI</h1>
      <p class="pg__lead">
        Framework playground — four shell skins + atom looks. Switch skin / light-dark to compare.
      </p>
    </header>

    <section class="pg__panel">
      <h2>Shell</h2>
      <div class="pg__row">
        <DwSegment
            v-model="skin"
            :tabs="skins.map((item) => ({id: item.id, label: item.label}))"
            aria-label="UI skin"
            size="sm"
        />
        <DwToolbarButton
            variant="toggle"
            :active="dark"
            title="Toggle theme"
            @click="dark = !dark"
        >
          <DwPhIcon :name="dark ? 'moon' : 'sun'" size="sm"/>
          {{ dark ? 'Dark' : 'Light' }}
        </DwToolbarButton>
      </div>
      <p class="pg__hint">{{ skinHint }} · <code>data-ui-skin="{{ skin }}"</code></p>
    </section>

    <section class="pg__shell">
      <h2 class="pg__shell-title">Mini workbench <span class="pg__muted">(skin chrome)</span></h2>
      <TabBar :active-tab-id="activeTab" :tabs-signature="demoTabs.map((t) => t.id).join(',')">
        <template #default="{bindTabRef}">
          <TabItem
              v-for="tab in demoTabs"
              :key="tab.id"
              :tab-id="tab.id"
              :title="tab.title"
              :active="activeTab === tab.id"
              closable
              :set-ref="bindTabRef"
              @select="activeTab = tab.id"
          />
        </template>
        <template #actions>
          <TabAddButton title="New tab"/>
        </template>
      </TabBar>
      <DwSplitPane
          class="pg__split"
          storage-key="pg-mini-split"
          :default-width="220"
          :min-width="160"
          :stack-below="false"
          handle-variant="line"
      >
        <template #start>
          <aside class="pg__rail">
            <p class="pg__rail-label">Explorer</p>
            <button
                v-for="tab in demoTabs"
                :key="tab.id"
                type="button"
                class="pg__rail-item"
                :class="{'is-active': activeTab === tab.id}"
                @click="activeTab = tab.id"
            >
              {{ tab.title }}
            </button>
          </aside>
        </template>
        <template #end>
          <div class="pg__stage">
            <DwBrowseToolbar
                v-model:query="query"
                query-placeholder="Filter…"
                :status-text="`${activeTab} · ${skin}`"
            >
              <template #actions>
                <DwButton variant="ghost" size="sm">Run</DwButton>
              </template>
            </DwBrowseToolbar>
            <EmptyState
                :title="`Active: ${demoTabs.find((t) => t.id === activeTab)?.title}`"
                :hint="`Skin “${skin}” reshapes tabs, seams, and radii.`"
                layout="inline"
                bordered
            >
              <template #icon>
                <DwPhIcon name="package" weight="duotone"/>
              </template>
            </EmptyState>
          </div>
        </template>
      </DwSplitPane>
    </section>

    <section class="pg__panel">
      <h2>Actions</h2>
      <div class="pg__row">
        <DwButton variant="primary" @click="formOpen = true">Open form dialog</DwButton>
        <DwButton variant="secondary" @click="toast.show('Hello from createToastController')">Toast</DwButton>
        <DwPhIcon name="sparkle" weight="duotone" size="md"/>
      </div>
    </section>

    <section class="pg__panel">
      <h2>Button variants</h2>
      <div class="pg__row">
        <DwButton variant="primary" size="sm">Primary</DwButton>
        <DwButton variant="secondary" size="sm">Secondary</DwButton>
        <DwButton variant="ghost" size="sm">Ghost</DwButton>
        <DwButton variant="soft" size="sm">Soft</DwButton>
        <DwButton variant="outline" size="sm">Outline</DwButton>
        <DwButton variant="link" size="sm">Link</DwButton>
        <DwButton variant="danger" size="sm">Danger</DwButton>
      </div>
    </section>

    <section class="pg__panel">
      <h2>Card looks</h2>
      <div class="pg__cards">
        <DwCard look="raised" title="Raised" description="Border + soft elevation.">
          Default panel surface.
        </DwCard>
        <DwCard look="outline" title="Outline" description="Border only, no fill wash.">
          Quiet structural card.
        </DwCard>
        <DwCard look="flat" title="Flat" description="Muted fill, no border weight.">
          Nested / inset feel.
        </DwCard>
      </div>
    </section>

    <section class="pg__panel">
      <h2>Segment looks</h2>
      <div class="pg__stack">
        <DwSegment v-model="segmentPill" :tabs="pillTabs" look="pill" aria-label="Pill segment"/>
        <DwSegment v-model="segmentLine" :tabs="lineTabs" look="underline" aria-label="Underline segment"/>
      </div>
    </section>

    <section class="pg__panel">
      <h2>StatusPill looks</h2>
      <div class="pg__row">
        <StatusPill status="ready" variant="success" look="solid" dot>Solid</StatusPill>
        <StatusPill status="ready" variant="success" look="soft" dot>Soft</StatusPill>
        <StatusPill status="ready" variant="success" look="outline" dot>Outline</StatusPill>
        <StatusPill status="syncing" variant="running" look="soft">Running</StatusPill>
        <StatusPill status="blocked" variant="error" look="outline">Error</StatusPill>
      </div>
    </section>

    <section class="pg__panel">
      <h2>Empty layouts</h2>
      <div class="pg__stack">
        <EmptyState
            title="Centered (default)"
            hint="Pick a resource or create one."
            layout="centered"
            compact
            bordered
        >
          <template #icon>
            <DwPhIcon name="package" weight="duotone"/>
          </template>
          <template #actions>
            <DwButton variant="primary" size="sm" @click="formOpen = true">Create</DwButton>
          </template>
        </EmptyState>
        <EmptyState
            title="Inline empty"
            hint="Useful inside toolbars and list headers."
            layout="inline"
            bordered
        >
          <template #icon>
            <DwPhIcon name="list" weight="duotone"/>
          </template>
          <template #actions>
            <DwButton variant="outline" size="sm">Filter</DwButton>
          </template>
        </EmptyState>
        <EmptyState
            title="Hero empty"
            hint="Showcase / first-run panels with more air."
            layout="hero"
            bordered
        >
          <template #icon>
            <DwPhIcon name="sparkle" weight="duotone"/>
          </template>
          <template #actions>
            <DwButton variant="soft" size="sm">Get started</DwButton>
          </template>
        </EmptyState>
      </div>
    </section>

    <section class="pg__panel">
      <h2>Browse toolbar <span class="pg__muted">(follows skin tokens)</span></h2>
      <DwBrowseToolbar
          v-model:query="query"
          query-placeholder="Filter resources…"
          :status-text="query ? `filter: ${query}` : '12 items'"
      >
        <template #actions>
          <DwButton variant="ghost" size="sm">Refresh</DwButton>
        </template>
      </DwBrowseToolbar>
    </section>

    <section class="pg__panel">
      <h2>Data grid</h2>
      <DwDataGrid
          v-model:selected-keys="gridSelected"
          :rows="gridRows"
          :columns="gridColumns"
          row-key="id"
          :show-pagination="false"
      />
    </section>

    <section class="pg__panel">
      <h2>Code viewer <span class="pg__muted">(engine=pre)</span></h2>
      <DwCodeViewer
          :content="sampleSql"
          title="sample.sql"
          language="sql"
          engine="pre"
          :dark="dark"
      />
    </section>

    <DwFormDialog
        v-model:open="formOpen"
        title="Create resource"
        subtitle="Minimal form dialog recipe"
        confirm-label="Create"
        @confirm="onSave"
    >
      <label style="display:flex;flex-direction:column;gap:6px;font-size:var(--dw-text-sm)">
        Name
        <DwInput v-model="name" placeholder="my-resource"/>
      </label>
    </DwFormDialog>

    <AppToast/>
  </div>
</template>
