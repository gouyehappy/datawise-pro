<script setup lang="ts">
withDefaults(
    defineProps<{
      title?: string
      subtitle?: string
      width?: 'default' | 'narrow' | 'wide' | 'layout' | 'full'
      readonly?: boolean
      readonlyHint?: string
      embedded?: boolean
    }>(),
    {
      width: 'default',
      readonly: false,
      embedded: false,
      title: '',
    },
)
</script>

<template>
  <div
      class="settings-page"
      :class="[`settings-page--${width}`, {'settings-page--embedded': embedded}]"
  >
    <header v-if="!embedded" class="panel-head panel-head--row">
      <div class="panel-head__copy">
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <slot name="actions"/>
    </header>

    <p
        v-if="readonly && readonlyHint"
        class="guest-notice"
        :class="{'guest-notice--embedded': embedded}"
    >
      {{ readonlyHint }}
    </p>

    <slot v-if="!embedded" name="tips"/>

    <div class="settings-page__body" :class="{'is-readonly': readonly}">
      <slot/>
    </div>
  </div>
</template>
