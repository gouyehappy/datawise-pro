<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {DwButton, DwEditableChip, EmptyState} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {ConnectionConfig} from '@/core/types'
import type {CommunityPluginInfo} from '@/shared/api/http/community-plugins'
import type {MarketplaceListItem} from '@/features/community-plugin/composables/useCommunityPluginCenter'
import CommunityPluginIcon from '@/features/community-plugin/components/CommunityPluginIcon.vue'
import {openUrl} from '@/shared/browser/open-url'

type Contribution = {
  type?: string
  id?: string
  label?: string
  description?: string
  capabilities?: string[]
  rootUri?: string
  schemes?: string[]
  sessionBound?: boolean
  openTarget?: string
}

type ContributionSection = {
  key: string
  title: string
  type?: string
  items: Contribution[]
}

const SECTION_ORDER = ['connection-provider', 'workbench', 'filesystem-provider'] as const

const props = defineProps<{
  selected: CommunityPluginInfo | null
  selectedStoreItem: MarketplaceListItem | null
  contributions: Contribution[]
  pluginConnections: ConnectionConfig[]
  installing: boolean
  installingCatalogKey: string
  pluginName: (plugin: CommunityPluginInfo) => string
  pluginDescription: (plugin: CommunityPluginInfo) => string
  storeEntryName: (item: MarketplaceListItem) => string
  storeEntryDescription: (item: MarketplaceListItem) => string
  contributionLabel: (contribution: Contribution, plugin?: CommunityPluginInfo) => string
  contributionDescription: (contribution: Contribution, plugin?: CommunityPluginInfo) => string
  contributionTypeLabel: (type?: string) => string
  catalogSourceLabel: (source?: string) => string
}>()

const emit = defineEmits<{
  installCatalog: [catalogId: string, pluginId: string]
  viewInstalled: [pluginId: string]
  openWorkbench: [contribution: Contribution]
  openFilesystem: [contribution: Contribution]
  openConnection: [contribution: Contribution]
  editConnection: [connection: ConnectionConfig]
  rollback: []
  uninstall: []
  openInstall: []
  openSettings: []
}>()

const {t, te} = useI18n()

const sourceUrl = computed(() => {
  const manifest = props.selected?.manifest
  if (!manifest) return ''
  const source = typeof manifest.source === 'string' ? manifest.source.trim() : ''
  if (source) return source
  const homepage = typeof manifest.homepage === 'string' ? manifest.homepage.trim() : ''
  return homepage
})

const contributionSections = computed<ContributionSection[]>(() => {
  const groups = new Map<string, Contribution[]>()
  for (const contribution of props.contributions) {
    const type = contribution.type || 'other'
    const list = groups.get(type) || []
    list.push(contribution)
    groups.set(type, list)
  }
  const ordered: ContributionSection[] = []
  for (const type of SECTION_ORDER) {
    const items = groups.get(type)
    if (!items?.length) continue
    groups.delete(type)
    ordered.push({
      key: type,
      type,
      title: sectionTitle(type, items[0]),
      items,
    })
  }
  for (const [type, items] of groups) {
    ordered.push({
      key: type,
      type,
      title: sectionTitle(type, items[0]),
      items,
    })
  }
  return ordered
})

function sectionTitle(type: string, _first?: Contribution) {
  if (type === 'connection-provider') return t('communityPlugin.connectionsSection')
  return props.contributionTypeLabel(type)
}

function connectionProvider(section: ContributionSection): Contribution | null {
  return section.items[0] ?? null
}

function openContribution(c: Contribution) {
  if (c.type === 'workbench') emit('openWorkbench', c)
  else if (c.type === 'filesystem-provider') emit('openFilesystem', c)
  else if (c.type === 'connection-provider') emit('openConnection', c)
}

function isActionable(c: Contribution) {
  return c.type === 'workbench' || c.type === 'filesystem-provider' || c.type === 'connection-provider'
}

function actionLabel(c: Contribution) {
  if (c.type === 'workbench') return t('communityPlugin.openContribution')
  if (c.type === 'filesystem-provider') return t('communityPlugin.openFilesystemShort')
  if (c.type === 'connection-provider') return t('communityPlugin.newConnectionShort')
  return t('communityPlugin.openContribution')
}

function actionIcon(c: Contribution) {
  if (c.type === 'workbench') return 'open-external'
  if (c.type === 'filesystem-provider') return 'tree'
  if (c.type === 'connection-provider') return 'add'
  return 'open-external'
}

function openSource() {
  if (!sourceUrl.value) return
  void openUrl(sourceUrl.value)
}
</script>

<template>
  <div class="community-plugin-detail-pane">
    <template v-if="selected && !selectedStoreItem">
      <header class="community-plugin-detail-pane__head">
        <div class="community-plugin-detail-pane__identity">
          <div class="community-plugin-detail-pane__hero">
            <CommunityPluginIcon
                class="community-plugin-detail-pane__mark"
                :plugin="selected"
                fallback="plugins"
                size="md"
            />
            <div class="community-plugin-detail-pane__hero-copy">
              <h2 class="community-plugin-detail-pane__title">{{ pluginName(selected) }}</h2>
              <p v-if="pluginDescription(selected)" class="community-plugin-detail-pane__desc">
                {{ pluginDescription(selected) }}
              </p>
              <p class="community-plugin-detail-pane__id-row">
                <span class="community-plugin-detail-pane__id">{{ selected.manifest.id }}</span>
                <button
                    v-if="sourceUrl"
                    type="button"
                    class="community-plugin-detail-pane__source"
                    :title="sourceUrl"
                    @click="openSource"
                >
                  <DwIcon name="github" size="sm" aria-hidden="true"/>
                </button>
                <span
                    class="community-plugin-detail-pane__compat"
                    :class="selected.compatibility?.compatible ? 'is-ok' : 'is-bad'"
                >
                  {{ selected.compatibility?.compatible
                    ? t('communityPlugin.compatible')
                    : t('communityPlugin.incompatible') }}
                </span>
              </p>
            </div>
          </div>
        </div>
      </header>

      <div
          v-if="!selected.compatibility?.compatible"
          class="community-plugin-banner is-warn"
      >
        {{ selected.compatibility?.errors?.join('; ') || t('communityPlugin.incompatible') }}
      </div>

      <section
          v-for="section in contributionSections"
          :key="section.key"
          class="community-plugin-detail-pane__section"
          :class="`is-${section.type || 'other'}`"
      >
        <div class="community-plugin-detail-pane__section-head">
          <div class="community-plugin-detail-pane__section-copy">
            <h3 class="community-plugin-section-title">{{ section.title }}</h3>
            <p
                v-if="section.type === 'connection-provider'
                  && connectionProvider(section)
                  && contributionDescription(connectionProvider(section)!, selected)"
                class="community-plugin-detail-pane__section-desc"
            >
              {{ contributionDescription(connectionProvider(section)!, selected) }}
            </p>
          </div>
        </div>

        <!-- Connections: prominent New + shared DwEditableChip (label | edit) -->
        <div
            v-if="section.type === 'connection-provider'"
            class="community-plugin-conn-panel"
        >
          <div class="community-plugin-conn-row">
            <DwButton
                v-if="connectionProvider(section)"
                size="sm"
                class="community-plugin-conn-new"
                @click="emit('openConnection', connectionProvider(section)!)"
            >
              <DwIcon name="add" size="sm" aria-hidden="true"/>
              {{ t('communityPlugin.newConnectionShort') }}
            </DwButton>
            <template v-if="pluginConnections.length">
              <DwEditableChip
                  v-for="conn in pluginConnections"
                  :key="conn.id"
                  :label="conn.name || conn.id"
                  :edit-title="t('communityPlugin.editConnection')"
                  :edit-aria-label="t('communityPlugin.editConnection')"
                  @edit="emit('editConnection', conn)"
              >
                <template #edit-icon>
                  <DwIcon name="edit" size="sm" aria-hidden="true"/>
                </template>
              </DwEditableChip>
            </template>
            <p v-else class="community-plugin-muted community-plugin-conn-empty">
              {{ t('communityPlugin.emptyConnections') }}
            </p>
          </div>
          <p class="community-plugin-conn-hint">
            {{ t('communityPlugin.connectionManageHint') }}
          </p>
        </div>

        <ul v-else class="community-plugin-contrib-list">
          <li
              v-for="c in section.items"
              :key="`${c.type}:${c.id}`"
              class="community-plugin-contrib"
              :class="`is-${c.type || 'other'}`"
          >
            <div class="community-plugin-contrib__copy">
              <div class="community-plugin-contrib__title-row">
                <strong>{{ contributionLabel(c, selected) }}</strong>
              </div>
              <p
                  v-if="contributionDescription(c, selected)"
                  class="community-plugin-contrib__desc"
              >
                {{ contributionDescription(c, selected) }}
              </p>
            </div>

            <DwButton
                v-if="c.type === 'workbench' || c.type === 'filesystem-provider'"
                variant="secondary"
                size="sm"
                class="community-plugin-contrib__btn"
                @click="openContribution(c)"
            >
              <DwIcon :name="actionIcon(c)" size="sm" aria-hidden="true"/>
              {{ actionLabel(c) }}
            </DwButton>
            <span
                v-else-if="!isActionable(c)"
                class="community-plugin-contrib__hint"
            >
              {{ te(`communityPlugin.contributionHostHint.${c.type}`)
                ? t(`communityPlugin.contributionHostHint.${c.type}`)
                : t('communityPlugin.contributionReserved') }}
            </span>
          </li>
        </ul>
      </section>

      <EmptyState
          v-if="!contributions.length"
          embedded
          :title="t('communityPlugin.noContributions')"
      />

      <footer class="community-plugin-detail-pane__manage">
        <span class="community-plugin-detail-pane__manage-label">
          {{ t('communityPlugin.manageSection') }}
        </span>
        <div class="community-plugin-detail-pane__manage-actions">
          <DwButton variant="ghost" size="sm" @click="emit('rollback')">
            <DwIcon name="rollback" size="sm" aria-hidden="true"/>
            {{ t('communityPlugin.rollbackShort') }}
          </DwButton>
          <DwButton
              variant="ghost"
              size="sm"
              class="community-plugin-detail-pane__uninstall"
              @click="emit('uninstall')"
          >
            <DwIcon name="delete" size="sm" aria-hidden="true"/>
            {{ t('communityPlugin.uninstall') }}
          </DwButton>
        </div>
      </footer>
    </template>

    <template v-else-if="selectedStoreItem">
      <header class="community-plugin-detail-pane__head">
        <div class="community-plugin-detail-pane__identity">
          <div class="community-plugin-detail-pane__hero">
            <CommunityPluginIcon
                class="community-plugin-detail-pane__mark"
                :plugin-id="selectedStoreItem.entry.status === 'installed' ? selectedStoreItem.entry.id : ''"
                fallback="plugins"
                size="md"
            />
            <div class="community-plugin-detail-pane__hero-copy">
              <h2 class="community-plugin-detail-pane__title">{{ storeEntryName(selectedStoreItem) }}</h2>
              <p class="community-plugin-detail-pane__desc">
                {{ storeEntryDescription(selectedStoreItem) }}
              </p>
              <p class="community-plugin-detail-pane__id-row">
                <span class="community-plugin-detail-pane__id">{{ selectedStoreItem.entry.id }}</span>
                <span class="community-plugin-detail-pane__meta-inline">
                  v{{ selectedStoreItem.entry.version }}
                  <template v-if="selectedStoreItem.entry.publisher">
                    · {{ selectedStoreItem.entry.publisher }}
                  </template>
                  <template v-if="catalogSourceLabel(selectedStoreItem.source)">
                    · {{ catalogSourceLabel(selectedStoreItem.source) }}
                  </template>
                </span>
              </p>
            </div>
          </div>
        </div>
        <div class="community-plugin-detail-pane__manage-actions">
          <DwButton
              v-if="selectedStoreItem.entry.installable"
              size="sm"
              :loading="installingCatalogKey === `${selectedStoreItem.catalogId}:${selectedStoreItem.entry.id}`"
              :disabled="installing"
              @click="emit('installCatalog', selectedStoreItem.catalogId, selectedStoreItem.entry.id)"
          >
            {{ t('communityPlugin.install') }}
          </DwButton>
          <DwButton
              v-else-if="selectedStoreItem.entry.status === 'installed'"
              variant="secondary"
              size="sm"
              @click="emit('viewInstalled', selectedStoreItem.entry.id)"
          >
            {{ t('communityPlugin.viewInstalled') }}
          </DwButton>
          <DwButton
              v-else
              variant="secondary"
              size="sm"
              @click="emit('openInstall')"
          >
            {{ t('communityPlugin.installLocal') }}
          </DwButton>
        </div>
      </header>
    </template>

    <EmptyState
        v-else
        embedded
        :title="t('communityPlugin.selectInstalled')"
        :hint="t('communityPlugin.emptyDetailHint')"
    >
      <template #actions>
        <DwButton size="sm" @click="emit('openInstall')">
          {{ t('communityPlugin.installLocal') }}
        </DwButton>
      </template>
    </EmptyState>
  </div>
</template>
