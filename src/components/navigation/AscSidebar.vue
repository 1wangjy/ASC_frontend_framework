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
        <!-- group with children: parent toggles an in-rail sublist -->
        <div v-else-if="item.children?.length" class="nav-group" :class="{ 'is-open': isGroupOpen(item) }">
          <button
            type="button"
            class="nav-item nav-item--parent"
            :class="{ 'nav-item--locked': itemLocked(item) }"
            :title="navTitle(item)"
            @click="toggleGroup(item)"
          >
            <AscIcon :name="item.icon" />
            <span>{{ item.label }}</span>
            <AscIcon v-if="itemLocked(item)" name="lock" class="nav-item__lock" />
            <AscIcon v-else-if="!collapsed" name="chevron" class="nav-group__caret" />
          </button>
          <transition name="navsub">
            <ul v-if="!collapsed && isGroupOpen(item)" class="nav-sublist">
              <li v-for="child in item.children" :key="child.path">
                <button
                  v-if="itemLocked(child)"
                  type="button"
                  class="nav-subitem nav-subitem--locked"
                  :title="`${child.label}（需登录）`"
                  @click="requireLogin"
                >
                  <AscIcon name="lock" class="nav-subitem__lock" />
                  <span>{{ child.label }}</span>
                </button>
                <router-link
                  v-else
                  :to="child.path"
                  class="nav-subitem"
                  :class="{ 'is-active': childIsActive(child) }"
                  @click="navChild"
                >
                  <span class="nav-subitem__dot" aria-hidden="true" />
                  <span>{{ child.label }}</span>
                </router-link>
              </li>
            </ul>
          </transition>
        </div>
        <!-- plain item -->
        <button
          v-else-if="itemLocked(item)"
          type="button"
          class="nav-item nav-item--locked"
          :title="navTitle(item)"
          @click="requireLogin"
        >
          <AscIcon :name="item.icon" />
          <span>{{ item.label }}</span>
          <AscIcon name="lock" class="nav-item__lock" />
        </button>
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
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AscIcon from '../ui/AscIcon.vue'
import {
  createPrimaryNavigationState,
  primaryNavigation
} from '../../features/navigation/appNavigation.js'
import { useAuthStore } from '../../store/auth.js'
import { navigationItemLocked } from '../../config/routeAccess.js'

const route = useRoute()
const router = useRouter()
const navigationState = createPrimaryNavigationState()
const authStore = useAuthStore()

watch(
  () => route.fullPath,
  () => navigationState.observe(route),
  { immediate: true }
)

const props = defineProps({
  mobileOpen: {
    type: Boolean,
    default: false
  },
  collapsed: {
    type: Boolean,
    default: false
  }
})

const expanded = ref('')
const emit = defineEmits(['close', 'toggle-collapse'])

// 未登录时：首页展示页可用，其余条目按路由配置判定为锁定（点击引导登录）
function itemLocked(item) {
  return navigationItemLocked(authStore.isLoggedIn, router, item.path)
}

function navTitle(item) {
  if (itemLocked(item)) return `${item.label}（需登录）`
  return props.collapsed ? item.label : undefined
}

function requireLogin() {
  authStore.openLoginModal()
}

function isGroupOpen(item) {
  return expanded.value === item.path
}

function toggleGroup(item) {
  if (itemLocked(item)) {
    requireLogin()
    return
  }
  if (props.collapsed) {
    // collapsed rail: no room for the list, just go to the overview
    emit('close')
    router.push(item.path)
    return
  }
  if (expanded.value === item.path) {
    // already open -> collapse the rail dropdown, keep the card page as-is
    expanded.value = ''
    emit('close')
    return
  }
  // open this group (mutually exclusive: only one expanded at a time) and
  // navigate to its overview card page
  expanded.value = item.path
  emit('close')
  router.push(item.path)
}

function navChild() {
  emit('close')
}

// exact-active for a child must compare path AND query, because several
// children can share one path and differ only by ?tab=?mode= (数据平台 parse/
// manage/literature, 问题研究 multi/single). router-link exact-active keys on
// path only, so those siblings would all highlight together.
function childIsActive(child) {
  const qi = child.path.indexOf('?')
  const path = qi >= 0 ? child.path.slice(0, qi) : child.path
  if (route.path !== path) return false
  if (qi < 0) return true
  const params = new URLSearchParams(child.path.slice(qi + 1))
  for (const [k, v] of params.entries()) {
    if (String(route.query[k] ?? '') !== v) return false
  }
  return true
}

// keep the parent group open when navigating into one of its children
watch(
  () => route.fullPath,
  () => {
    const activePath = route.path
    for (const item of primaryNavigation) {
      if (item.children?.some((c) => c.path.split('?')[0] === activePath)) {
        expanded.value = item.path
        return
      }
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.sidebar {
  position: fixed;
  z-index: 40;
  inset: 0 auto 0 0;
  width: var(--asc-sidebar-width);
  display: flex;
  flex-direction: column;
  padding: var(--asc-sp-5) var(--asc-sp-3) var(--asc-sp-4);
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
  gap: var(--asc-sp-2);
  font-size: var(--asc-fs-h2);
  font-weight: 800;
  letter-spacing: 0.01em;
  color: #fff;
  text-decoration: none;
}

.brand__mark {
  width: var(--asc-sp-6);
  height: var(--asc-sp-6);
  display: grid;
  place-items: center;
  border-radius: var(--asc-radius-lg);
  background: #fff;
  color: var(--asc-primary);
  font-size: var(--asc-fs-small);
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
  top: var(--asc-sp-5);
  left: calc(var(--asc-sidebar-width) - var(--asc-sp-3));
  width: var(--asc-sp-5);
  height: var(--asc-sp-5);
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.32);
  border-radius: var(--asc-radius-pill);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 4px 14px rgba(4, 28, 49, 0.22);
  color: var(--asc-primary);
  font-size: var(--asc-fs-h3);
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
  gap: var(--asc-sp-1);
  margin-top: var(--asc-sp-1);
}

.nav-divider {
  height: 1px;
  margin: var(--asc-sp-3) var(--asc-sp-2);
  background: var(--asc-nav-line);
}

.nav-item {
  position: relative;
  min-height: var(--asc-nav-item-h);
  display: flex;
  align-items: center;
  gap: var(--asc-nav-gap);
  padding: 0 var(--asc-nav-pad-x);
  border-radius: var(--asc-radius);
  color: #bcd3e6;
  font-size: var(--asc-fs-body);
  font-weight: 550;
  text-decoration: none;
  transition: background var(--asc-transition), color var(--asc-transition);
}

.nav-item .asc-icon {
  width: var(--asc-nav-icon);
  height: var(--asc-nav-icon);
  flex: 0 0 auto;
  opacity: 0.82;
  transition: opacity var(--asc-transition);
}

.nav-item:hover {
  background: var(--asc-nav-surface-hover);
  color: #f2f8fd;
}

.nav-item:hover .asc-icon {
  opacity: 1;
}

/* Pro-style active: thin indicator bar + soft wash instead of a solid block */
.nav-item.router-link-exact-active {
  background: var(--asc-nav-surface-active);
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

/* 未登录：条目仍可见可点，但点击引导登录（视觉上弱化 + 右侧锁标） */
.nav-item--locked {
  width: 100%;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: left;
  color: #93aec5;
  cursor: pointer;
}

.nav-item--locked .asc-icon {
  opacity: 0.6;
}

.nav-item--locked:hover {
  background: var(--asc-nav-surface-hover);
  color: #cfe2f1;
}

.nav-item__lock {
  width: 14px;
  height: 14px;
  margin-left: auto;
  opacity: 0.75;
}

/* ── 用户信息栏 ── */
.sidebar-footer {
  margin-top: auto;
  padding-top: var(--asc-sp-4);
  border-top: 1px solid var(--asc-nav-line);
}

.user-info {
  display: flex;
  align-items: center;
  gap: var(--asc-sp-2);
  margin-bottom: var(--asc-sp-3);
  padding: var(--asc-sp-2) var(--asc-sp-3);
  border-radius: var(--asc-radius);
  background: rgba(255, 255, 255, 0.05);
}

.user-avatar {
  width: var(--asc-sp-6);
  height: var(--asc-sp-6);
  border-radius: 50%;
  background: linear-gradient(135deg, #139968, #0869ad);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--asc-fs-body);
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.user-details {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: var(--asc-fs-small);
  font-weight: 650;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-status {
  font-size: var(--asc-fs-micro);
  color: #9dbcd6;
  margin-top: 1px;
}

.sidebar-btn {
  width: 100%;
  padding: var(--asc-sp-2);
  border-radius: var(--asc-radius);
  font-size: var(--asc-fs-small);
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
.sidebar--collapsed .user-info { justify-content: center; padding: var(--asc-sp-2); }
.sidebar--collapsed .user-details { display: none; }
.sidebar--collapsed .sidebar-btn { font-size: var(--asc-fs-micro); padding: 6px; }

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
    left: calc(var(--asc-sidebar-collapsed-width) - 12px);
  }

  .sidebar--collapsed .primary-nav {
    width: 44px;
    margin-inline: auto;
  }

  .sidebar--collapsed .nav-item {
    width: 44px;
    justify-content: center;
    padding: 0;
    font-size: var(--asc-nav-icon);
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

/* ── Group with inline children (Pro-Sidebar style accordion) ── */
.nav-group {
  position: relative;
}
.nav-item--parent {
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.nav-group__caret {
  width: 12px;
  height: 12px;
  margin-left: auto;
  opacity: 0.75;
  transform: rotate(0deg);
  transition: transform var(--asc-transition), opacity var(--asc-transition);
}
.nav-group.is-open .nav-group__caret {
  transform: rotate(90deg);
}
.nav-item--parent:hover .nav-group__caret,
.nav-group.is-open .nav-item--parent .nav-group__caret {
  opacity: 1;
}

.nav-sublist {
  margin: var(--asc-nav-row-gap) 0 var(--asc-sp-2);
  padding: 0;
  list-style: none;
}
.nav-subitem {
  display: flex;
  align-items: center;
  gap: var(--asc-nav-subitem-gap);
  min-height: var(--asc-nav-subitem-h);
  /* 与一级项同源节奏：左缩进 sp-1、左内边距 sp-3、右内边距 sp-2；
     相较原始值整体收窄约 1/3（16→12、12→8、8→4、10→8） */
  margin: var(--asc-nav-row-gap) 0 var(--asc-nav-row-gap) var(--asc-nav-subitem-offset);
  padding: 0 var(--asc-nav-subitem-pad-r) 0 var(--asc-nav-subitem-pad-l);
  border-radius: var(--asc-radius);
  border-left: 1px solid var(--asc-nav-line);
  color: #bcd3e6;
  font-size: var(--asc-fs-small);
  font-weight: 550;
  text-decoration: none;
  transition: background var(--asc-transition), color var(--asc-transition);
}
.nav-subitem__dot {
  width: var(--asc-nav-dot);
  height: var(--asc-nav-dot);
  border-radius: 50%;
  background: currentColor;
  opacity: 0.5;
  flex: 0 0 auto;
}
.nav-subitem:hover {
  background: var(--asc-nav-surface-hover);
  color: #f2f8fd;
}
.nav-subitem.is-active {
  background: var(--asc-nav-surface-active);
  color: #fff;
  font-weight: 650;
}
.nav-subitem.is-active .nav-subitem__dot {
  opacity: 1;
  box-shadow: 0 0 0 3px rgba(79, 183, 236, 0.18);
}
.nav-subitem--locked {
  width: calc(100% - var(--asc-nav-subitem-offset));
  border: 0;
  border-left: 1px solid var(--asc-nav-line);
  background: transparent;
  font-family: inherit;
  text-align: left;
  color: #8ea8bf;
  cursor: pointer;
}
.nav-subitem--locked:hover {
  background: var(--asc-nav-surface-hover);
  color: #cfe2f1;
}
.nav-subitem__lock {
  width: 12px;
  height: 12px;
  opacity: 0.7;
  flex: 0 0 auto;
}

.navsub-enter-active,
.navsub-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.navsub-enter-from,
.navsub-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

</style>

