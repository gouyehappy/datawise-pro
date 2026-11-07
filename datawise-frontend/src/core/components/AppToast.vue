<script setup lang="ts">
/**
 * Thin host wrapper — SoT `@datawise/overlays` AppToast.
 * Titles via `registerUiI18nHost` (`toast.kinds.*`).
 */
import {AppToast as PackageAppToast} from '@datawise/overlays'
</script>

<template>
  <PackageAppToast/>
</template>
