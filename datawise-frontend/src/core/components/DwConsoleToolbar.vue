<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/chrome` DwConsoleToolbar. */
import {DwConsoleToolbar as PackageDwConsoleToolbar} from '@datawise/chrome'
</script>

<template>
  <PackageDwConsoleToolbar>
    <template v-if="$slots.start" #start>
      <slot name="start"/>
    </template>
    <slot/>
    <template v-if="$slots.context" #context>
      <slot name="context"/>
    </template>
    <template v-if="$slots.end" #end>
      <slot name="end"/>
    </template>
  </PackageDwConsoleToolbar>
</template>
