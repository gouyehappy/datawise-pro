<script setup lang="ts">
defineOptions({name: 'CommunityPluginCenterTab'})
import {ConfirmDialog, DwSplitPane, IconButton} from '@/core/components'
import {DwIcon} from '@/core/icons'
import type {WorkspaceTab} from '@/core/types'
import {useCommunityPluginCenter} from '@/features/community-plugin/composables/useCommunityPluginCenter'
import CommunityPluginListPane from '@/features/community-plugin/components/CommunityPluginListPane.vue'
import CommunityPluginDetailPane from '@/features/community-plugin/components/CommunityPluginDetailPane.vue'
import CommunityPluginInstallMenu from '@/features/community-plugin/components/CommunityPluginInstallMenu.vue'
import CommunityPluginSettingsDrawer from '@/features/community-plugin/components/CommunityPluginSettingsDrawer.vue'
import '@/features/community-plugin/styles/community-plugin-center.css'

defineProps<{
  tab?: WorkspaceTab
}>()

const {
  t,
  confirmOpen,
  confirmTitle,
  confirmMessage,
  confirmLabel,
  confirmVariant,
  onConfirmDialog,
  onConfirmOpenUpdate,
  trustKeys,
  repositories,
  trustKeyDraft,
  repoDraft,
  savingTrust,
  savingRepos,
  loading,
  error,
  installWarnings,
  selectedId,
  selectedStoreKey,
  searchQuery,
  settingsOpen,
  installMenuOpen,
  installPath,
  installUrl,
  allowUnsigned,
  installing,
  installingCatalogKey,
  fileInputRef,
  selected,
  selectedStoreItem,
  catalogFetchErrors,
  filteredInstalled,
  filteredStore,
  contributions,
  pluginConnections,
  catalogSourceLabel,
  pluginName,
  pluginListTitle,
  pluginListMeta,
  pluginDescription,
  contributionLabel,
  contributionDescription,
  contributionTypeLabel,
  storeEntryName,
  storeEntryDescription,
  selectInstalled,
  selectStoreItem,
  refresh,
  installFromPath,
  installFromUrl,
  installFromCatalog,
  addTrustKey,
  removeTrustKey,
  addRepository,
  removeRepository,
  onPickFile,
  onDragOver,
  onDropFile,
  uninstallSelected,
  rollbackSelected,
  openWorkbench,
  openFilesystem,
  openConnectionProvider,
  editPluginConnection,
} = useCommunityPluginCenter()
</script>

<template>
  <div class="community-plugin-center-tab">
    <header class="community-plugin-center-tab__toolbar">
      <div class="community-plugin-center-tab__toolbar-actions">
        <CommunityPluginInstallMenu
            v-model:open="installMenuOpen"
            v-model:install-path="installPath"
            v-model:install-url="installUrl"
            :installing="installing"
            @choose-file="fileInputRef?.click()"
            @install-path="installFromPath()"
            @install-url="installFromUrl()"
        />
        <IconButton
            size="sm"
            :title="t('communityPlugin.settingsTitle')"
            @click="settingsOpen = true"
        >
          <DwIcon name="settings" size="sm"/>
        </IconButton>
        <IconButton
            size="sm"
            :title="t('communityPlugin.refresh')"
            :disabled="loading"
            @click="refresh()"
        >
          <DwIcon name="refresh" size="sm" :class="{ 'is-spinning': loading }"/>
        </IconButton>
      </div>
    </header>

    <p v-if="error" class="community-plugin-alert" role="alert">{{ error }}</p>
    <div v-if="installWarnings.length" class="community-plugin-alert community-plugin-alert--warning" role="status">
      <strong>{{ t('communityPlugin.installWarningsTitle') }}</strong>
      <ul class="community-plugin-alert__list">
        <li v-for="warning in installWarnings" :key="warning">{{ warning }}</li>
      </ul>
    </div>
    <p
        v-for="catalog in catalogFetchErrors"
        :key="`err:${catalog.id}`"
        class="community-plugin-alert"
        role="alert"
    >
      {{ t('communityPlugin.catalogFetchError', {
        name: catalog.name || catalog.repositoryId || catalog.id,
        error: catalog.error,
      }) }}
    </p>

    <DwSplitPane
        class="community-plugin-center-tab__split"
        storage-key="dw.split.community-plugin-center"
        default-ratio="third"
        :default-width="240"
        :min-width="180"
        :max-width="420"
        :stack-below="720"
        start-class="community-plugin-center-tab__start"
        end-class="community-plugin-center-tab__end"
    >
      <template #start>
        <CommunityPluginListPane
            v-model:search-query="searchQuery"
            :installed="filteredInstalled"
            :store-items="filteredStore"
            :selected-id="selectedId"
            :selected-store-key="selectedStoreKey"
            :loading="loading"
            :plugin-name="pluginListTitle"
            :plugin-meta="pluginListMeta"
            :store-entry-name="storeEntryName"
            :catalog-source-label="catalogSourceLabel"
            @select-installed="selectInstalled"
            @select-store="selectStoreItem"
            @open-install="installMenuOpen = true"
        />
      </template>
      <template #end>
        <CommunityPluginDetailPane
            :selected="selected"
            :selected-store-item="selectedStoreItem"
            :contributions="contributions"
            :plugin-connections="pluginConnections"
            :installing="installing"
            :installing-catalog-key="installingCatalogKey"
            :plugin-name="pluginName"
            :plugin-description="pluginDescription"
            :store-entry-name="storeEntryName"
            :store-entry-description="storeEntryDescription"
            :contribution-label="contributionLabel"
            :contribution-description="contributionDescription"
            :contribution-type-label="contributionTypeLabel"
            :catalog-source-label="catalogSourceLabel"
            @install-catalog="(catalogId, pluginId) => installFromCatalog(catalogId, pluginId)"
            @view-installed="selectInstalled"
            @open-workbench="openWorkbench"
            @open-filesystem="openFilesystem"
            @open-connection="openConnectionProvider"
            @edit-connection="editPluginConnection"
            @rollback="rollbackSelected()"
            @uninstall="uninstallSelected()"
            @open-install="installMenuOpen = true"
            @open-settings="settingsOpen = true"
        />
      </template>
    </DwSplitPane>

    <input
        ref="fileInputRef"
        type="file"
        accept=".dwp,application/zip"
        class="community-plugin-file-input"
        @change="onPickFile"
    >

    <CommunityPluginSettingsDrawer
        :open="settingsOpen"
        :trust-keys="trustKeys"
        :repositories="repositories"
        :trust-key-draft="trustKeyDraft"
        :repo-draft="repoDraft"
        :saving-trust="savingTrust"
        :saving-repos="savingRepos"
        :allow-unsigned="allowUnsigned"
        @close="settingsOpen = false"
        @update:allow-unsigned="allowUnsigned = $event"
        @patch-trust-key-draft="(patch) => { trustKeyDraft = {...trustKeyDraft, ...patch} }"
        @patch-repo-draft="(patch) => { repoDraft = {...repoDraft, ...patch} }"
        @add-trust-key="addTrustKey()"
        @remove-trust-key="removeTrustKey"
        @add-repository="addRepository()"
        @remove-repository="removeRepository"
        @drag-over="onDragOver"
        @drop-file="onDropFile"
        @choose-file="fileInputRef?.click()"
    />

    <ConfirmDialog
        :open="confirmOpen"
        :title="confirmTitle"
        :message="confirmMessage"
        :confirm-label="confirmLabel"
        :confirm-variant="confirmVariant"
        @update:open="onConfirmOpenUpdate"
        @confirm="onConfirmDialog"
    />
  </div>
</template>
