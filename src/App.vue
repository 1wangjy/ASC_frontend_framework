<template>
  <AscShell>
    <WorkflowRouteOutlet />
  </AscShell>
  <AscLoginModal />
</template>

<script setup>
import { onMounted } from 'vue'
import AscShell from './layouts/AscShell.vue'
import AscLoginModal from './components/ui/AscLoginModal.vue'
import { WorkflowRouteOutlet } from './features/navigation/WorkflowRouteOutlet.js'
import { useAuthStore } from './store/auth.js'

const authStore = useAuthStore()
onMounted(() => authStore.restoreLogin())
</script>
