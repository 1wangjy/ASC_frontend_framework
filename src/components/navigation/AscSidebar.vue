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
  padding: 20px 12px 16px;
  overflow-y: auto;
  background: var(--asc-sidebar);
  color: #fff;
  transition: width var(--asc-transition), padding var(--asc-transition), transform var(--asc-transition);
}

/* ── 品牌区 ── */
.sidebar__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: #fff;
  text-decoration: none;
}

.brand__mark {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #fff;
  color: var(--asc-primary);
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.02em;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}

.brand__name {
  font-weight: 800;
  letter-spacing: 0.03em;
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

/* ── 折叠开关：贴合右缘的半圆角小钮，与栏同色系不抢眼 ── */
.sidebar__toggle {
  position: fixed;
  z-index: 45;
  top: 24px;
  left: calc(var(--asc-sidebar-width) - 15px);
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 4px 14px rgba(4, 28, 49, 0.22);
  color: var(--asc-primary);
  font-size: 15px;
  cursor: pointer;
  transition: left var(--asc-transition), background var(--asc-transition), color var(--asc-transition), transform var(--asc-transition);
}

.sidebar__toggle:hover {
  background: #fff;
  color: var(--asc-primary-hover);
  transform: translateY(-1px);
}

.sidebar__toggle-icon--collapse {
  transform: rotate(180deg);
}

/* ── 主导航：扁平、细纹、激活用左侧指示条 ── */
.primary-nav {
  display: grid;
  gap: 4px;
  margin-top: 4px;
}

.nav-divider {
  height: 1px;
  margin: 10px 8px;
  background: rgba(255, 255, 255, 0.12);
}

.nav-item {
  position: relative;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  border-radius: 7px;
  color: #bcd3e6;
  font-size: 14px;
  font-weight: 550;
  text-decoration: none;
  transition: background var(--asc-transition), color var(--asc-transition);
}

.nav-item .asc-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  opacity: 0.82;
  transition: opacity var(--asc-transition);
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.07);
  color: #f2f8fd;
}

.nav-item:hover .asc-icon {
  opacity: 1;
}

/* Pro-style active: thin indicator bar + soft wash instead of a solid block */
.nav-item.router-link-exact-active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-weight: 650;
}

.nav-item.router-link-exact-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 20px;
  transform: translateY(-50%);
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, #4fb7ec, #7fd4f2);
  box-shadow: 0 0 8px rgba(79, 183, 236, 0.6);
}

.nav-item.router-link-exact-active .asc-icon {
  opacity: 1;
}

/* ── 用户信息栏 ── */
.sidebar-footer {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
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
  color: #9dbcd6;
  margin-top: 1px;
}

.sidebar-btn {
  width: 100%;
  padding: 8px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

/* 幽灵/描边登录钮：克制，悬停再填充 */
.login-btn {
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: transparent;
  color: #eaf3fb;
}
.login-btn:hover {
  background: #fff;
  color: var(--asc-primary);
  border-color: #fff;
}

.logout-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #cfe0ee;
  border: 1px solid transparent;
}
.logout-btn:hover { background: rgba(255, 255, 255, 0.16); }

.sidebar--collapsed .sidebar-footer { text-align: center; }
.sidebar--collapsed .user-info { justify-content: center; padding: 8px; }
.sidebar--collapsed .user-details { display: none; }
.sidebar--collapsed .sidebar-btn { font-size: 11px; padding: 6px; }

@media (min-width: 761px) {
  .sidebar--collapsed {
    width: var(--asc-sidebar-collapsed-width);
    padding-inline: 12px;
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

  .sidebar--collapsed .nav-item.router-link-exact-active::before {
    left: -8px;
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
