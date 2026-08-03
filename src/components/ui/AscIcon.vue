<template>
  <svg
    class="asc-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <template v-if="name === 'home'">
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v11h14V9M9 20v-6h6v6" />
    </template>
    <template v-else-if="name === 'document'">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </template>
    <template v-else-if="name === 'graph'">
      <circle cx="12" cy="4.5" r="2.5" />
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
      <path d="m10.8 6.7-4.5 9M13.2 6.7l4.5 9M7.5 18h9" />
    </template>
    <template v-else-if="name === 'database'">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </template>
    <template v-else-if="name === 'model'">
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14M5 12h14" />
    </template>
    <template v-else-if="name === 'menu'">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="m6 6 12 12M18 6 6 18" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </template>
    <template v-else-if="name === 'send'">
      <path d="m21 3-7 18-4-7-7-4 18-7Z" />
      <path d="m10 14 4-4" />
    </template>
    <template v-else-if="name === 'paperclip'">
      <path d="m20.5 11.5-8.2 8.2a6 6 0 0 1-8.5-8.5l8.9-8.9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 1 1-2.8-2.8l8.2-8.2" />
    </template>
    <template v-else-if="name === 'check'">
      <path d="m5 12 4 4L19 6" />
    </template>
    <template v-else-if="name === 'chevron'">
      <path d="m9 18 6-6-6-6" />
    </template>
    <template v-else>
      <circle cx="12" cy="12" r="8" />
    </template>
  </svg>
</template>

<script setup>
defineProps({
  name: {
    type: String,
    required: true
  }
})
</script>

<style scoped>
.asc-icon {
  width: 1.1em;
  height: 1.1em;
  flex: 0 0 auto;
}
</style>
