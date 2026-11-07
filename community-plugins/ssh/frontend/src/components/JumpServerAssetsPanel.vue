<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Loader2, RefreshCw, Star } from "@lucide/vue";

export type JumpServerAsset = {
  id: string;
  name: string;
  address: string;
  comment?: string;
  favorite?: boolean;
};

const props = defineProps<{
  sessionId: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}>();

const emit = defineEmits<{
  entered: [asset: JumpServerAsset];
}>();

const loading = ref(false);
const enteringId = ref("");
const starringId = ref("");
const listError = ref("");
const enterError = ref("");
const search = ref("");
const filterMode = ref<"all" | "favorites">("all");
const assets = ref<JumpServerAsset[]>([]);
const source = ref("");

const favoriteCount = computed(
  () => assets.value.filter((row) => row.favorite).length,
);

const filteredAssets = computed(() => {
  const q = search.value.trim().toLowerCase();
  return assets.value.filter((row) => {
    if (filterMode.value === "favorites" && !row.favorite) return false;
    if (!q) return true;
    const hay = `${row.name} ${row.address} ${row.comment ?? ""} ${row.id}`.toLowerCase();
    return hay.includes(q);
  });
});

function rowKey(asset: JumpServerAsset) {
  return asset.id || asset.address || asset.name;
}

async function refresh() {
  if (!props.sessionId) return;
  loading.value = true;
  listError.value = "";
  enterError.value = "";
  try {
    const result = await window.datawisePlugin.invoke<{
      assets?: JumpServerAsset[];
      source?: string;
    }>(
      "jumpserver/assets/list",
      { sessionId: props.sessionId },
      { timeoutMs: 60_000 },
    );
    assets.value = Array.isArray(result?.assets) ? result.assets : [];
    source.value = typeof result?.source === "string" ? result.source : "";
    if (!assets.value.length) {
      listError.value = props.t("jumpserver.empty");
    }
  } catch (cause) {
    listError.value = cause instanceof Error ? cause.message : String(cause);
    assets.value = [];
    source.value = "";
  } finally {
    loading.value = false;
  }
}

async function toggleFavorite(asset: JumpServerAsset) {
  if (!props.sessionId || starringId.value) return;
  const next = !asset.favorite;
  starringId.value = rowKey(asset);
  enterError.value = "";
  try {
    await window.datawisePlugin.invoke(
      "jumpserver/assets/favorite",
      {
        sessionId: props.sessionId,
        assetId: asset.id || undefined,
        address: asset.address || undefined,
        name: asset.name || undefined,
        favorite: next,
      },
      { timeoutMs: 20_000 },
    );
    const key = rowKey(asset);
    assets.value = assets.value.map((row) =>
      rowKey(row) === key ? { ...row, favorite: next } : row,
    );
    // Keep favorites pinned to the top without a full reload.
    assets.value = [...assets.value].sort((a, b) => {
      const af = a.favorite ? 1 : 0;
      const bf = b.favorite ? 1 : 0;
      if (af !== bf) return bf - af;
      return (a.name || "").localeCompare(b.name || "");
    });
  } catch (cause) {
    enterError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    starringId.value = "";
  }
}

async function enterAsset(asset: JumpServerAsset) {
  if (!props.sessionId || enteringId.value) return;
  enteringId.value = rowKey(asset);
  enterError.value = "";
  try {
    const numericId =
      source.value === "opt" && /^\d+$/.test(asset.id || "") ? asset.id : undefined;
    await window.datawisePlugin.invoke(
      "jumpserver/assets/enter",
      {
        sessionId: props.sessionId,
        address: asset.address || asset.name,
        menuId: numericId,
      },
      { timeoutMs: 8_000 },
    );
    emit("entered", asset);
  } catch (cause) {
    enterError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    enteringId.value = "";
  }
}

onMounted(() => {
  void refresh();
});

watch(
  () => props.sessionId,
  () => {
    void refresh();
  },
);
</script>

<template>
  <div class="js-assets">
    <div class="js-assets-toolbar">
      <input
        v-model="search"
        class="js-assets-search"
        type="search"
        :placeholder="t('jumpserver.search')"
      />
      <button class="icon-button" :title="t('refresh')" :disabled="loading" @click="refresh">
        <RefreshCw :class="{ spinning: loading }" />
      </button>
    </div>
    <div class="js-assets-tabs">
      <button
        type="button"
        class="js-assets-tab"
        :class="{ active: filterMode === 'all' }"
        @click="filterMode = 'all'"
      >
        {{ t("jumpserver.filterAll") }}
      </button>
      <button
        type="button"
        class="js-assets-tab"
        :class="{ active: filterMode === 'favorites' }"
        @click="filterMode = 'favorites'"
      >
        {{ t("jumpserver.filterFavorites") }}
        <span v-if="favoriteCount" class="js-assets-tab-count">{{ favoriteCount }}</span>
      </button>
    </div>
    <p v-if="enterError" class="task-error">
      {{ enterError }}
      <button class="link-button" @click="enterError = ''">{{ t("close") }}</button>
    </p>
    <div v-if="loading && !assets.length" class="empty compact">
      <Loader2 class="spinning" />{{ t("loading") }}
    </div>
    <p v-else-if="listError && !assets.length" class="task-error">
      {{ listError }}
      <button class="link-button" @click="refresh">{{ t("retry") }}</button>
    </p>
    <div v-else-if="!filteredAssets.length" class="empty compact">
      {{
        filterMode === "favorites" && !favoriteCount
          ? t("jumpserver.favoritesEmpty")
          : assets.length
            ? t("jumpserver.noMatch")
            : t("jumpserver.empty")
      }}
    </div>
    <div v-else class="js-assets-list">
      <div class="file-header js-assets-grid">
        <span></span>
        <span>{{ t("jumpserver.name") }}</span>
        <span>{{ t("jumpserver.address") }}</span>
        <span></span>
      </div>
      <div
        v-for="row in filteredAssets"
        :key="rowKey(row)"
        class="file-row js-assets-grid"
      >
        <button
          type="button"
          class="js-fav-btn"
          :class="{ active: row.favorite }"
          :title="row.favorite ? t('jumpserver.unfavorite') : t('jumpserver.favorite')"
          :disabled="!!starringId"
          @click="toggleFavorite(row)"
        >
          <Star :fill="row.favorite ? 'currentColor' : 'none'" />
        </button>
        <span class="mono" :title="row.comment || row.name">{{ row.name || "—" }}</span>
        <span class="mono" :title="row.address">{{ row.address || "—" }}</span>
        <span>
          <button
            class="link-button"
            :disabled="!!enteringId"
            @click="enterAsset(row)"
          >
            {{
              enteringId === rowKey(row) ? t("jumpserver.entering") : t("jumpserver.enter")
            }}
          </button>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.js-assets {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 240px;
  max-height: min(70vh, 560px);
}
.js-assets-toolbar {
  display: flex;
  gap: 6px;
  align-items: center;
  flex: 0 0 auto;
}
.js-assets-search {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border, #333);
  border-radius: 4px;
  background: var(--color-background, #111);
  color: var(--color-foreground, #eee);
}
.js-assets-tabs {
  display: flex;
  gap: 4px;
  flex: 0 0 auto;
}
.js-assets-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--color-border, #333);
  border-radius: 4px;
  background: transparent;
  color: var(--color-muted-foreground, #999);
  font-size: var(--dw-font-size);
  cursor: pointer;
}
.js-assets-tab.active {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-foreground, #eee);
  background: color-mix(in srgb, var(--color-primary, #3b82f6) 16%, transparent);
}
.js-assets-tab-count {
  min-width: 1.25em;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-foreground, #eee) 12%, transparent);
  font-variant-numeric: tabular-nums;
}
.js-assets-list {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
}
.js-assets-grid {
  display: grid;
  grid-template-columns: 28px minmax(0, 1.2fr) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.js-fav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-muted-foreground, #888);
  cursor: pointer;
}
.js-fav-btn :deep(svg) {
  width: 14px;
  height: 14px;
}
.js-fav-btn.active {
  color: #eab308;
}
.js-fav-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
