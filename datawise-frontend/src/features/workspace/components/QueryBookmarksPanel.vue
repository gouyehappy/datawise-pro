<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import type {TeamSharedQuerySummary} from '@/core/types'
import {StatusPill, EmptyState} from '@/core/components'
import {DwIcon} from '@/core/icons'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {readStoredSharedSqlEditorShortcuts} from '@/features/settings/services/sql-editor-shortcuts.service'
import {
    bookmarksFromTeamLibrary,
    collectBookmarkTags,
    filterQueryBookmarks,
    groupBookmarksByFolder,
    isDefaultBookmarkFolder,
    isQueryLibraryFolder,
    isSharedSnippetFolder,
    mergeQueryBookmarks,
    REPORT_TEMPLATE_FOLDER_PREFIX,
    REPORT_TEMPLATE_TAG,
    type QueryBookmarkItem,
} from '@/features/workspace/services/query-bookmark.service'
import QueryLibraryVersionsDialog from '@/features/platform/components/QueryLibraryVersionsDialog.vue'
import {exportQueryBookmarkForGitCi} from '@/features/workspace/services/query-library-git.service'
import {useTeamStore} from '@/features/team/stores/team-store'
import {openTeamSharedQueryInConsole} from '@/features/team/services/team-shared-query.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {
    REPORT_TEMPLATE_CATEGORIES,
    type ReportTemplateCategory,
} from '@/features/workspace/constants/report-sql-templates'

type BookmarkScope = 'all' | 'personal' | 'library'

const emit = defineEmits<{
    saveBookmark: []
}>()

const {t} = useI18n()
const layout = useLayoutStore()
const shortcutPanel = useShortcutPanelStore()
const workspace = useWorkspaceStore()
const teamStore = useTeamStore()

const search = ref('')
const activeTag = ref<string | null>(null)
const activeReportCategory = ref<ReportTemplateCategory | null>(null)
const scope = ref<BookmarkScope>('all')
const libraryDialogOpen = ref(false)
const libraryQueryId = ref<string | null>(null)
const libraryQueryTitle = ref('')
const teamQueries = ref<TeamSharedQuerySummary[]>([])
const teamQueriesLoading = ref(false)
const openingTeamQueryId = ref<string | null>(null)

const teamLibraryBookmarks = computed(() =>
    teamStore.activeTeamId
        ? bookmarksFromTeamLibrary(teamStore.activeTeamId, teamQueries.value)
        : [],
)

const allBookmarks = computed(() =>
    mergeQueryBookmarks(
        shortcutPanel.savedConsoles,
        readStoredSharedSqlEditorShortcuts().snippets ?? [],
        true,
        teamLibraryBookmarks.value,
    ),
)

const scopedBookmarks = computed(() => {
    if (scope.value === 'library') {
        return allBookmarks.value.filter((item) => item.source === 'team-library')
    }
    if (scope.value === 'personal') {
        return allBookmarks.value.filter((item) => item.source !== 'team-library')
    }
    return allBookmarks.value
})

const filteredBookmarks = computed(() =>
    filterQueryBookmarks(
        scopedBookmarks.value,
        search.value,
        activeTag.value,
        scope.value === 'library' ? null : activeReportCategory.value,
    ),
)

const groupedBookmarks = computed(() => groupBookmarksByFolder(filteredBookmarks.value))
const tagOptions = computed(() => collectBookmarkTags(scopedBookmarks.value))
const showTagFilter = computed(() => tagOptions.value.length > 0)
const showScenarioFilter = computed(() => scope.value !== 'library')
const libraryCount = computed(() => teamLibraryBookmarks.value.length)
const personalCount = computed(() =>
    allBookmarks.value.filter((item) => item.source !== 'team-library').length,
)

const emptyTitle = computed(() => {
    if (scope.value === 'library' && !teamStore.activeTeamId) {
        return t('shortcut.bookmarks.libraryNoTeam')
    }
    if (scope.value === 'library') {
        return t('shortcut.bookmarks.libraryEmpty')
    }
    return t('shortcut.bookmarks.empty')
})

const emptyHint = computed(() => {
    if (scope.value === 'library' && !teamStore.activeTeamId) {
        return t('shortcut.bookmarks.libraryNoTeamHint')
    }
    if (scope.value === 'library') {
        return t('shortcut.bookmarks.libraryEmptyHint')
    }
    return t('shortcut.bookmarks.emptyHint')
})

async function reloadTeamLibrary(teamId: string | null) {
    if (!teamId) {
        teamQueries.value = []
        return
    }
    teamQueriesLoading.value = true
    try {
        teamQueries.value = await teamStore.fetchSharedQueries(teamId)
    } catch (error) {
        teamQueries.value = []
        const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.loadFailed')
        layout.showErrorToast(message)
    } finally {
        teamQueriesLoading.value = false
    }
}

watch(
    () => teamStore.activeTeamId,
    (teamId) => {
        void reloadTeamLibrary(teamId)
    },
    {immediate: true},
)

function folderLabel(folder: string): string {
    if (isQueryLibraryFolder(folder)) {
        return t('shortcut.bookmarks.queryLibraryFolder')
    }
    if (isDefaultBookmarkFolder(folder)) {
        return t('shortcut.bookmarks.defaultFolder')
    }
    if (isSharedSnippetFolder(folder)) {
        return t('shortcut.bookmarks.sharedSnippet')
    }
    if (folder.startsWith(`${REPORT_TEMPLATE_FOLDER_PREFIX}/`)) {
        const category = folder.slice(REPORT_TEMPLATE_FOLDER_PREFIX.length + 1) as ReportTemplateCategory
        return t(`shortcut.bookmarks.reportCategories.${category}`)
    }
    return folder
}

function displayTags(item: QueryBookmarkItem): string[] {
    return item.tags.filter((tag) => tag !== REPORT_TEMPLATE_TAG)
}

async function openBookmark(item: QueryBookmarkItem) {
    if (item.source === 'team-library' && item.teamId && item.teamQueryId) {
        if (openingTeamQueryId.value) return
        openingTeamQueryId.value = item.teamQueryId
        try {
            await openTeamSharedQueryInConsole(item.teamId, {
                id: item.teamQueryId,
                teamId: item.teamId,
                title: item.name,
                description: item.description ?? '',
                connectionId: '',
                connectionName: item.connectionName ?? '',
                database: '',
                tags: item.tags,
                sharedByUserName: '',
                sharedByUserId: 0,
                sharedAt: '',
                updatedAt: item.updatedAt ?? '',
                commentCount: 0,
                favoriteCount: 0,
                starredByCurrentUser: false,
            }, {
                getDetail: (teamId, queryId) => teamStore.getSharedQuery(teamId, queryId),
                openConsole: (options) => workspace.openConsole(options),
                setModule: (module) => layout.setModule(module),
            })
        } catch (error) {
            const message = resolveCaughtApiErrorMessage(error, t, 'team.sharedQueries.loadFailed')
            layout.showErrorToast(message)
        } finally {
            openingTeamQueryId.value = null
        }
        return
    }

    layout.setModule('database')
    workspace.openConsole({
        connectionName: item.connectionName && item.connectionName !== '—' ? item.connectionName : undefined,
        sql: item.sql || 'SELECT 1;',
    })
}

function openQueryLibraryHistory(item: QueryBookmarkItem, event: Event) {
    event.stopPropagation()
    if (!teamStore.activeTeamId || item.source !== 'console') return
    libraryQueryId.value = item.id
    libraryQueryTitle.value = item.name
    libraryDialogOpen.value = true
}

function exportForGitCi(item: QueryBookmarkItem, event: Event) {
    event.stopPropagation()
    if (item.source !== 'console' || !item.sql.trim()) {
        layout.showErrorToast(t('platform.queryLibrary.exportFailed'))
        return
    }
    exportQueryBookmarkForGitCi(item)
    layout.showSuccessToast(t('platform.queryLibrary.exportSuccess'))
}

function goToTeam() {
    layout.setModule('team')
}
</script>

<template>
  <div class="bookmarks-panel">
    <div class="bookmarks-panel__toolbar">
      <input
          v-model="search"
          class="bookmarks-panel__search"
          type="search"
          :placeholder="t('shortcut.bookmarks.searchPlaceholder')"
      />
      <button class="bookmarks-panel__add" type="button" @click="emit('saveBookmark')">
        {{ t('shortcut.bookmarks.save') }}
      </button>
    </div>

    <div class="bookmarks-panel__filter-block">
      <span class="bookmarks-panel__filter-label">{{ t('shortcut.bookmarks.scopeLabel') }}</span>
      <div class="bookmarks-panel__chips">
        <button
            class="bookmarks-panel__chip"
            :class="{ 'is-active': scope === 'all' }"
            type="button"
            @click="scope = 'all'"
        >
          {{ t('shortcut.bookmarks.scopeAll') }}
        </button>
        <button
            class="bookmarks-panel__chip"
            :class="{ 'is-active': scope === 'library' }"
            type="button"
            @click="scope = 'library'"
        >
          {{ t('shortcut.bookmarks.scopeLibrary') }}
          <span v-if="libraryCount" class="bookmarks-panel__chip-count">{{ libraryCount }}</span>
        </button>
        <button
            class="bookmarks-panel__chip"
            :class="{ 'is-active': scope === 'personal' }"
            type="button"
            @click="scope = 'personal'"
        >
          {{ t('shortcut.bookmarks.scopePersonal') }}
          <span v-if="personalCount" class="bookmarks-panel__chip-count">{{ personalCount }}</span>
        </button>
      </div>
    </div>

    <div v-if="showScenarioFilter" class="bookmarks-panel__filter-block">
      <span class="bookmarks-panel__filter-label">{{ t('shortcut.bookmarks.categoryLabel') }}</span>
      <div class="bookmarks-panel__chips">
        <button
            class="bookmarks-panel__chip"
            :class="{ 'is-active': !activeReportCategory }"
            type="button"
            @click="activeReportCategory = null"
        >
          {{ t('shortcut.bookmarks.allCategories') }}
        </button>
        <button
            v-for="category in REPORT_TEMPLATE_CATEGORIES"
            :key="category"
            class="bookmarks-panel__chip"
            :class="{ 'is-active': activeReportCategory === category }"
            type="button"
            @click="activeReportCategory = activeReportCategory === category ? null : category"
        >
          {{ t(`shortcut.bookmarks.reportCategories.${category}`) }}
        </button>
      </div>
    </div>

    <div v-if="showTagFilter" class="bookmarks-panel__filter-block bookmarks-panel__filter-block--tags">
      <span class="bookmarks-panel__filter-label">{{ t('shortcut.bookmarks.tagLabel') }}</span>
      <div class="bookmarks-panel__chips">
        <button
            class="bookmarks-panel__chip"
            :class="{ 'is-active': !activeTag }"
            type="button"
            @click="activeTag = null"
        >
          {{ t('shortcut.bookmarks.allTags') }}
        </button>
        <button
            v-for="tag in tagOptions"
            :key="tag"
            class="bookmarks-panel__chip"
            :class="{ 'is-active': activeTag === tag }"
            type="button"
            @click="activeTag = activeTag === tag ? null : tag"
        >
          {{ tag }}
        </button>
      </div>
    </div>

    <p v-if="teamQueriesLoading && scope !== 'personal'" class="bookmarks-panel__loading">
      {{ t('shortcut.bookmarks.libraryLoading') }}
    </p>

    <EmptyState
        v-else-if="!filteredBookmarks.length"
        :title="emptyTitle"
        :hint="emptyHint"
    >
      <template v-if="scope === 'library' && !teamStore.activeTeamId" #actions>
        <button class="bookmarks-panel__add" type="button" @click="goToTeam">
          {{ t('shortcut.bookmarks.openTeam') }}
        </button>
      </template>
    </EmptyState>

    <div v-else class="bookmarks-panel__groups">
      <section v-for="[folder, items] in groupedBookmarks" :key="folder" class="bookmarks-group">
        <header class="bookmarks-group__head">
          <h5>{{ folderLabel(folder) }}</h5>
          <span class="bookmarks-group__count">{{ items.length }}</span>
        </header>
        <ul class="bookmarks-group__list">
          <li v-for="item in items" :key="item.id" class="bookmark-card">
            <button class="bookmark-card__main" type="button" @click="openBookmark(item)">
              <span class="bookmark-card__icon" aria-hidden="true">
                <DwIcon
                    :name="item.source === 'team-library' ? 'users' : 'console'"
                    size="sm"
                    :stroke-width="1.6"
                />
              </span>
              <span class="bookmark-card__body">
                <span class="bookmark-card__title-row">
                  <span class="bookmark-card__title">{{ item.name }}</span>
                  <StatusPill v-if="item.source === 'team-library'" variant="team">
                    {{ t('shortcut.bookmarks.queryLibraryFolder') }}
                  </StatusPill>
                  <StatusPill v-else-if="item.teamShared" variant="team">{{ t('shortcut.teamShared') }}</StatusPill>
                  <StatusPill v-if="item.source === 'shared-snippet'" variant="primary">{{ t('shortcut.bookmarks.sharedSnippet') }}</StatusPill>
                  <StatusPill v-if="item.source === 'report-template'" variant="accent">{{ t('shortcut.bookmarks.reportTemplate') }}</StatusPill>
                </span>
                <span v-if="item.description" class="bookmark-card__desc">{{ item.description }}</span>
                <span v-if="item.connectionName && item.connectionName !== '—'" class="bookmark-card__meta">{{ item.connectionName }}</span>
                <span v-else-if="displayTags(item).length" class="bookmark-card__meta">{{ displayTags(item).join(' · ') }}</span>
              </span>
              <span class="bookmark-card__chevron" aria-hidden="true">›</span>
            </button>
            <div v-if="item.source === 'console'" class="bookmark-card__actions">
              <button
                  class="bookmark-card__action"
                  type="button"
                  :title="t('platform.queryLibrary.exportForGitCi')"
                  @click="exportForGitCi(item, $event)"
              >
                <DwIcon name="export" size="sm" :stroke-width="1.35"/>
              </button>
              <button
                  v-if="teamStore.activeTeamId"
                  class="bookmark-card__action"
                  type="button"
                  :title="t('platform.queryLibrary.viewHistory')"
                  @click="openQueryLibraryHistory(item, $event)"
              >
                <DwIcon name="history" size="sm" :stroke-width="1.35"/>
              </button>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>

  <QueryLibraryVersionsDialog
      v-model:open="libraryDialogOpen"
      :team-id="teamStore.activeTeamId"
      :query-id="libraryQueryId"
      :query-title="libraryQueryTitle"
  />
</template>

<style scoped>
.bookmarks-panel {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-6);
}

.bookmarks-panel__toolbar {
  display: flex;
  gap: var(--dw-gap);
}

.bookmarks-panel__search {
  flex: 1;
  min-width: 0;
  padding: var(--dw-pad-control);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
}

.bookmarks-panel__add {
  flex-shrink: 0;
  padding: var(--dw-space-4) var(--dw-space-6);
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-control-radius);
  background: var(--dw-bg-panel);
  color: var(--dw-text);
  font-size: var(--dw-text-sm);
  font-weight: 500;
  cursor: pointer;
}

.bookmarks-panel__add:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 24%, var(--dw-border-light));
  color: var(--dw-primary);
}

.bookmarks-panel__filter-block {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap-sm);
}

.bookmarks-panel__filter-block--tags {
  padding-top: var(--dw-space-1);
  border-top: 1px dashed var(--dw-border-light);
}

.bookmarks-panel__filter-label {
  font-size: var(--dw-text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dw-text-muted);
}

.bookmarks-panel__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dw-gap-sm);
}

.bookmarks-panel__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--dw-space-2);
  padding: var(--dw-space-2) var(--dw-space-5);
  border-radius: var(--dw-radius-pill);
  border: 1px solid var(--dw-border-light);
  background: var(--dw-bg-panel);
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading-snug);
  cursor: pointer;
}

.bookmarks-panel__chip.is-active {
  border-color: var(--dw-primary);
  color: var(--dw-primary);
  background: color-mix(in srgb, var(--dw-primary) 8%, var(--dw-bg-panel));
}

.bookmarks-panel__chip-count {
  min-width: 1.1em;
  padding: 0 4px;
  border-radius: var(--dw-radius-pill);
  background: color-mix(in srgb, var(--dw-text) 8%, transparent);
  font-weight: 600;
}

.bookmarks-panel__loading {
  margin: 0;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-sm);
}

.bookmarks-panel__groups {
  display: flex;
  flex-direction: column;
  gap: var(--dw-space-7);
}

.bookmarks-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dw-gap);
  margin-bottom: var(--dw-space-3);
  padding-bottom: var(--dw-space-3);
  border-bottom: 1px solid var(--dw-border-light);
}

.bookmarks-group__head h5 {
  margin: 0;
  font-size: var(--dw-text-sm);
  font-weight: 700;
  color: var(--dw-text);
}

.bookmarks-group__count {
  min-width: var(--dw-icon-size-xl);
  padding: 1px var(--dw-space-3);
  border-radius: var(--dw-radius-pill);
  background: var(--dw-bg-muted);
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  font-weight: 600;
  text-align: center;
}

.bookmarks-group__list {
  display: flex;
  flex-direction: column;
  gap: var(--dw-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.bookmark-card {
  display: flex;
  align-items: stretch;
  gap: 0;
  width: 100%;
  border: 1px solid var(--dw-border-light);
  border-radius: var(--dw-panel-radius);
  background: var(--dw-bg);
  overflow: hidden;
  transition: var(--dw-transition-colors), box-shadow 0.12s ease;
}

.bookmark-card:hover {
  border-color: color-mix(in srgb, var(--dw-primary) 22%, var(--dw-border-light));
  background: color-mix(in srgb, var(--dw-primary) 4%, var(--dw-bg));
  box-shadow: 0 2px 8px color-mix(in srgb, var(--dw-text) 5%, transparent);
}

.bookmark-card__main {
  display: flex;
  flex: 1;
  align-items: flex-start;
  gap: var(--dw-gap-md);
  min-width: 0;
  padding: var(--dw-space-5) var(--dw-space-5);
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.bookmark-card__actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--dw-space-1);
  padding: var(--dw-space-2) var(--dw-space-3) var(--dw-space-2) 0;
  flex-shrink: 0;
}

.bookmark-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: var(--dw-tab-height);
  margin-top: 1px;
  border-radius: var(--dw-control-radius);
  background: color-mix(in srgb, var(--dw-primary) 10%, var(--dw-bg-muted));
  color: var(--dw-primary);
}

.bookmark-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--dw-gap-xs);
  min-width: 0;
}

.bookmark-card__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dw-space-2) var(--dw-space-3);
}

.bookmark-card__title {
  font-size: var(--dw-text-md);
  font-weight: 600;
  line-height: var(--dw-leading-snug);
  color: var(--dw-text);
  word-break: break-word;
}

.bookmark-card__desc {
  color: var(--dw-text-secondary);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.bookmark-card__meta {
  color: var(--dw-text-muted);
  font-size: var(--dw-text-xs);
  line-height: var(--dw-leading);
}

.bookmark-card__chevron {
  flex-shrink: 0;
  align-self: center;
  color: var(--dw-text-muted);
  font-size: var(--dw-text-2xl);
  line-height: 1;
  opacity: 0.45;
}

.bookmark-card__action {
  flex-shrink: 0;
  align-self: center;
  border: none;
  background: transparent;
  color: var(--dw-text-muted);
  cursor: pointer;
  padding: var(--dw-space-2);
  border-radius: var(--dw-control-radius-sm);
}

.bookmark-card__action:hover {
  color: var(--dw-primary);
  background: var(--dw-bg-subtle);
}

.bookmark-card:hover .bookmark-card__chevron {
  opacity: 1;
  color: var(--dw-primary);
}
</style>
