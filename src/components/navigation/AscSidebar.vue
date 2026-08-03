<template>
  <aside class="sidebar" :class="{ 'sidebar--open': mobileOpen }">
    <div class="sidebar__head">
      <router-link class="brand" to="/" @click="$emit('close')">
        <span class="brand__mark">ASC</span>
        <span>ASC LAB</span>
      </router-link>
      <button class="sidebar__close" type="button" aria-label="关闭导航" @click="$emit('close')">
        <AscIcon name="close" />
      </button>
    </div>

    <button class="new-question" type="button" @click="$emit('new-chat')">
      <AscIcon name="plus" />
      <span>新建问答</span>
    </button>

    <nav class="primary-nav" aria-label="主要导航">
      <router-link
        v-for="item in primaryNavigation"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        @click="$emit('close')"
      >
        <AscIcon :name="item.icon" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>

    <section class="recent">
      <p class="sidebar-label">最近会话</p>
      <button
        v-for="conversation in recentConversations"
        :key="conversation.id"
        type="button"
        class="recent__item"
        @click="$emit('open-conversation', conversation)"
      >
        <span>{{ conversation.title }}</span>
      </button>
    </section>

  </aside>
</template>

<script setup>
import AscIcon from '../ui/AscIcon.vue'
import { primaryNavigation, recentConversations } from '../../features/navigation/appNavigation.js'

defineProps({
  mobileOpen: {
    type: Boolean,
    default: false
  }
})

defineEmits(['close', 'new-chat', 'open-conversation'])
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

.new-question {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 15px;
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: var(--asc-radius);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 15px;
  font-weight: 750;
  transition: background var(--asc-transition), border-color var(--asc-transition);
}

.new-question:hover {
  border-color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.14);
}

.primary-nav {
  display: grid;
  gap: 5px;
  margin-top: 17px;
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

.recent {
  margin-top: 24px;
}

.sidebar-label {
  margin: 0 10px 8px;
  color: #8db5d0;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.08em;
}

.recent__item {
  width: 100%;
  padding: 8px 10px;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #c9deec;
  font-size: 12px;
  line-height: 1.35;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent__item:hover {
  background: rgba(255, 255, 255, 0.07);
  color: #fff;
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
}
</style>
