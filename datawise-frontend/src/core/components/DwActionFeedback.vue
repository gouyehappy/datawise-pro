<script setup lang="ts">
/** Thin host wrapper — SoT `@datawise/ui` DwActionFeedback. */
import {DwActionFeedback as PackageDwActionFeedback} from '@datawise/ui'

withDefaults(
  defineProps<{
    message?: string | null
    ok?: boolean | null
  }>(),
  {
    message: null,
    ok: null,
  },
)
</script>

<template>
  <PackageDwActionFeedback :message="message" :ok="ok"/>
</template>
