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
    <template v-else-if="name === 'report'">
      <path d="M6 3h9l3 3v18H6z" />
      <path d="M15 3v4h4M9 12h6M9 16h6M9 20h4" />
    </template>
    <template v-else-if="name === 'database'">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </template>
    <template v-else-if="name === 'model'">
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21" />
    </template>
    <template v-else-if="name === 'book'">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 5.5v15M8 7.5h7M8 11h7" />
    </template>
    <template v-else-if="name === 'chat'">
      <path d="M20 12.5c0 3.9-3.6 7-8 7-1 0-2-.2-2.9-.5L5 21l1.2-3.4A6.6 6.6 0 0 1 4 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7Z" />
      <path d="M9 12h6M9 15h4" />
    </template>
    <template v-else-if="name === 'chart'">
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-3M12 16V9M16 16v-5M20 16v-2" />
    </template>
    <template v-else-if="name === 'flask'">
      <path d="M9 3h6M10 3v6.2L5.6 17A2.4 2.4 0 0 0 7.7 20.6h8.6A2.4 2.4 0 0 0 18.4 17L14 9.2V3" />
      <path d="M7.5 14h9" />
    </template>
    <template v-else-if="name === 'cube'">
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
      <circle cx="12" cy="12" r="1.4" />
    </template>
    <template v-else-if="name === 'thermometer'">
      <path d="M13.5 14.4V5.5a2 2 0 1 0-4 0v8.9a4 4 0 1 0 4 0Z" />
      <path d="M11.5 17.5h0" />
    </template>
    <template v-else-if="name === 'lock'">
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
      <path d="M12 14.5v1.8" />
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
    <template v-else-if="name === 'refresh'">
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18.2 9A7 7 0 0 0 6.5 6.5L4 9M5.8 15A7 7 0 0 0 17.5 17.5L20 15" />
    </template>
    <template v-else-if="name === 'expand'">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      <path d="m3 8 6-6M21 8l-6-6M3 16l6 6M21 16l-6 6" />
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
