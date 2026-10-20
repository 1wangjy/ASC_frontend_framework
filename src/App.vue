<template>
  <AscShell>
    <WorkflowRouteOutlet v-if="canAccessRoute(authStore.isLoggedIn, route)" :key="routeOwnerKey" />
  </AscShell>
  <AscLoginModal />
</template>

<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './store/auth.js'
import { canAccessRoute, routeRequiresAuth } from './config/routeAccess.js'
import AscShell from './layouts/AscShell.vue'
import AscLoginModal from './components/ui/AscLoginModal.vue'
import { WorkflowRouteOutlet } from './features/navigation/WorkflowRouteOutlet.js'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
// Destroy cached workflow views on logout or account change, including inactive
// KeepAlive pages. Normal navigation within the same account keeps its state.
const routeOwnerKey = computed(() => authStore.isLoggedIn
  ? `user:${authStore.currentUser.id ?? authStore.username}` : 'anonymous')
watch(() => authStore.isLoggedIn, loggedIn => {
  if (!loggedIn && routeRequiresAuth(route)) void router.replace({ name: 'AscHome' })
})
</script>
