<template>
  <PackFeatureStub pack-id="pack.ai" context="team.aiSession" ai/>
</template>

<script setup lang="ts">
import PackFeatureStub from '@/features/pack/stubs/PackFeatureStub.vue'

/** Props kept for call-site compatibility (session detail not shown on stub). */
defineProps<{
  session?: unknown
}>()
</script>
