<template>
  <aside
    class="sidebar"
    :class="{
      'sidebar--open': mobileOpen,
      'sidebar--collapsed': collapsed
    }"
  >
    <div class="sidebar__head">
      <router-link class="brand" to="/" title="ASC LAB" @click="$emit('close')">
        <span class="brand__mark">ASC</span>
        <span class="brand__name">ASC LAB</span>
      </router-link>
      <button class="sidebar__close" type="button" aria-label="关闭导航" @click="$emit('close')">
        <AscIcon name="close" />
      </button>
    </div>

    <button
      class="sidebar__toggle"
      type="button"
      :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'"
      :title="collapsed ? '展开侧边栏' : '收起侧边栏'"
      @click="$emit('toggle-collapse')"
    >
      <AscIcon name="chevron" :class="{ 'sidebar__toggle-icon--collapse': !collapsed }" />
    </button>

    <nav class="primary-nav" aria-label="主要导航">
      <template v-for="item in primaryNavigation" :key="item.path || item.divider">
        <div v-if="item.divider" class="nav-divider" />
        <router-link
          v-else
          :to="navigationState.target(item)"
          class="nav-item"
          :class="{ 'router-link-exact-active': route.meta.navigationPath === item.path }"
          :title="collapsed ? item.label : undefined"
          @click="$emit('close')"
        >
          <AscIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </router-link>
      </template>
    </nav>

    <!-- 用户信息栏 -->
    <div class="sidebar-footer">
      <div class="user-info">
        <div class="user-avatar">{{ authStore.avatarText }}</div>
        <div class="user-details">
          <div class="user-name">{{ authStore.isLoggedIn ? authStore.username : '未登录' }}</div>
          <div class="user-status">{{ authStore.isLoggedIn ? '已登录' : '点击登录' }}</div>
        </div>
      </div>
      <button
        v-if="!authStore.isLoggedIn"
        class="sidebar-btn login-btn"
        @click="authStore.openLoginModal()"
      >登录</button>
      <button
        v-else
        class="sidebar-btn logout-btn"
        @click="authStore.logout()"
      >退出登录</button>
    </div>
  </aside>
</template>

<script setup>
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import AscIcon from '../ui/AscIcon.vue'
import {
  createPrimaryNavigationState,
  primaryNavigation
} from '../../features/navigation/appNavigation.js'
import { useAuthStore } from '../../store/auth.js'

const route = useRoute()
const navigationState = createPrimaryNavigationState()
const authStore = useAuthStore()

watch(
  () => route.fullPath,
  () => navigationState.observe(route),
  { immediate: true }
)

defineProps({
  mobileOpen: {
    type: Boolean,
    default: false
  },
  collapsed: {
    type: Boolean,
    default: false
  }
})

defineEmits(['close', 'toggle-collapse'])
</script>

<style scoped>
.sidebar {
  position: fixed;
  z-index: 40;
  inset: 0 auto 0 0;
  width: var(--asc-sidebar-width);
  display: flex;
  flex-direction: column;
  padding: 22px 14px 18px;
  overflow-y: auto;
  background: var(--asc-sidebar);
  color: #fff;
  transition: width var(--asc-transition), padding var(--asc-transition), transform var(--asc-transition);
}

.sidebar__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.01em;
}

.brand__mark {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #fff;
  color: var(--asc-primary);
  font-size: 14px;
  font-weight: 900;
}

.sidebar__close {
  display: none;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 20px;
}

.sidebar__toggle {
  position: fixed;
  z-index: 45;
  top: 26px;
  left: calc(var(--asc-sidebar-width) - 15px);
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--asc-border-strong);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 5px 16px rgba(4, 45, 80, 0.18);
  color: var(--asc-primary);
  font-size: 16px;
  transition: left var(--asc-transition), background var(--asc-transition), color var(--asc-transition);
}

.sidebar__toggle:hover {
  background: var(--asc-primary-soft);
  color: var(--asc-primary-hover);
}

.sidebar__toggle-icon--collapse {
  transform: rotate(180deg);
}

.primary-nav {
  display: grid;
  gap: 5px;
  margin-top: 4px;
}

.nav-divider {
  height: 1px;
  margin: 8px 10px;
  background: rgba(255, 255, 255, 0.15);
}

.nav-item {
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 13px;
  border-radius: 7px;
  color: #d9ebf7;
  font-size: 14px;
  font-weight: 650;
  transition: background var(--asc-transition), color var(--asc-transition);
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-item.router-link-exact-active {
  background: #0e69a8;
  color: #fff;
  box-shadow: inset 3px 0 0 #63c4eb;
}

/* ── 用户信息栏 ── */
.sidebar-footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.12);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 7px;
  background: rgba(255,255,255,0.06);
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #139968, #0869ad);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.user-details {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 650;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-status {
  font-size: 11px;
  color: #aac7df;
  margin-top: 1px;
}

.sidebar-btn {
  width: 100%;
  padding: 9px;
  border: 0;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.login-btn {
  background: #0e69a8;
  color: #fff;
}
.login-btn:hover { background: #0a5a91; }

.logout-btn {
  background: rgba(255,255,255,0.1);
  color: #d9ebf7;
}
.logout-btn:hover { background: rgba(255,255,255,0.16); }

.sidebar--collapsed .sidebar-footer { text-align: center; }
.sidebar--collapsed .user-info { justify-content: center; padding: 8px; }
.sidebar--collapsed .user-details { display: none; }
.sidebar--collapsed .sidebar-btn { font-size: 11px; padding: 6px; }

@media (min-width: 761px) {
  .sidebar--collapsed {
    width: var(--asc-sidebar-collapsed-width);
    padding-inline: 14px;
    overflow-x: hidden;
  }

  .sidebar--collapsed .sidebar__head {
    justify-content: center;
  }

  .sidebar--collapsed .brand {
    justify-content: center;
  }

  .sidebar--collapsed .brand__name,
  .sidebar--collapsed .nav-item span {
    display: none;
  }

  .sidebar--collapsed .sidebar__toggle {
    left: calc(var(--asc-sidebar-collapsed-width) - 15px);
  }

  .sidebar--collapsed .primary-nav {
    width: 44px;
    margin-inline: auto;
  }

  .sidebar--collapsed .nav-item {
    width: 44px;
    justify-content: center;
    padding: 0;
    font-size: 18px;
  }
}

@media (max-width: 760px) {
  .sidebar {
    width: min(286px, 86vw);
    transform: translateX(-102%);
    box-shadow: var(--asc-shadow);
    transition: transform var(--asc-transition);
  }

  .sidebar--open {
    transform: translateX(0);
  }

  .sidebar__close {
    display: grid;
  }

  .sidebar__toggle {
    display: none;
  }
}
</style>
