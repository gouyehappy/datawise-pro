<script setup lang="ts">
/** Unified stroke icon set for Process Ops chrome (24×24 viewBox). */
export type PoIconName =
  | 'panel-left'
  | 'panel-right'
  | 'settings'
  | 'bastion'
  | 'plus'
  | 'minus'
  | 'discover'
  | 'edit'
  | 'play'
  | 'stop'
  | 'close'
  | 'refresh'
  | 'copy'
  | 'run';

withDefaults(
  defineProps<{
    name: PoIconName;
    size?: number;
  }>(),
  { size: 16 },
);
</script>

<template>
  <svg
    class="po-icon"
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- panel collapse / expand -->
    <template v-if="name === 'panel-left'">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15" />
      <path d="M14.5 9.5 12 12l2.5 2.5" />
    </template>
    <template v-else-if="name === 'panel-right'">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15" />
      <path d="M12 9.5 14.5 12 12 14.5" />
    </template>

    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M4.9 6.4l1.6 1.5M17.5 16.1l1.6 1.5M3.5 12h2.2M18.3 12h2.2M4.9 17.6l1.6-1.5M17.5 7.9l1.6-1.5"
      />
    </template>

    <template v-else-if="name === 'bastion'">
      <path d="M5 20V9.5L12 4l7 5.5V20" />
      <path d="M9.5 20v-6h5v6" />
    </template>

    <template v-else-if="name === 'plus'">
      <path d="M12 6v12M6 12h12" />
    </template>

    <template v-else-if="name === 'minus'">
      <path d="M6 12h12" />
    </template>

    <template v-else-if="name === 'discover'">
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.25" fill="currentColor" stroke="none" />
      <path d="M12 4.5v2.2M12 17.3v2.2M4.5 12h2.2M17.3 12h2.2" />
    </template>

    <template v-else-if="name === 'edit'">
      <path d="M4.5 19.5h4.2L19 9.2a2.1 2.1 0 0 0-3-3L5.7 16.5z" />
      <path d="M14.2 7.2l2.6 2.6" />
    </template>

    <template v-else-if="name === 'play'">
      <path d="M9 7.2v9.6l8.2-4.8z" fill="currentColor" stroke="none" />
    </template>

    <template v-else-if="name === 'stop'">
      <rect x="7.5" y="7.5" width="9" height="9" rx="1.2" fill="currentColor" stroke="none" />
    </template>

    <template v-else-if="name === 'close'">
      <path d="M7 7l10 10M17 7 7 17" />
    </template>

    <template v-else-if="name === 'refresh'">
      <path d="M19 12a7 7 0 1 1-1.7-4.6" />
      <path d="M19 5v5h-5" />
    </template>

    <template v-else-if="name === 'copy'">
      <rect x="8.5" y="8.5" width="10" height="12" rx="1.5" />
      <path d="M6.5 15.5H5.8A1.8 1.8 0 0 1 4 13.7V5.8A1.8 1.8 0 0 1 5.8 4h7.9A1.8 1.8 0 0 1 15.5 5.8v.7" />
    </template>

    <template v-else-if="name === 'run'">
      <path d="M5 6.5v11l10-5.5z" fill="currentColor" stroke="none" />
      <path d="M17.5 6.5v11" />
    </template>
  </svg>
</template>
