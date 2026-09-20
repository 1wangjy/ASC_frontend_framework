<template>
  <AscShell>
    <WorkflowRouteOutlet />
  </AscShell>
  <AscLoginModal />
</template>

<script setup>
import AscShell from './layouts/AscShell.vue'
import AscLoginModal from './components/ui/AscLoginModal.vue'
import { WorkflowRouteOutlet } from './features/navigation/WorkflowRouteOutlet.js'
</script>
