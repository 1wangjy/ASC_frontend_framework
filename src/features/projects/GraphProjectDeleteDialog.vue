<template>
  <Teleport to="body" :disabled="teleportDisabled">
    <div
      class="project-delete-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="project-delete-title"
      aria-describedby="project-delete-description"
      tabindex="-1"
      @keydown.esc="cancel"
    >
      <section class="project-delete-dialog__panel">
        <span class="project-delete-dialog__eyebrow">删除项目</span>
        <h2 id="project-delete-title">确认删除 {{ projectName }}？</h2>
        <p id="project-delete-description">{{ warning }}</p>

        <div class="project-delete-dialog__actions">
          <button type="button" :disabled="deleting" @click="cancel">取消</button>
          <button
            type="button"
            class="project-delete-dialog__confirm"
            :disabled="deleting"
            @click="$emit('confirm')"
          >
            {{ deleting ? '删除中…' : '确认删除' }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'

import { normalizeProjectName, projectDeletionMessage } from './graphProjectWorkspaceModel.js'

const props = defineProps({
  project: { type: Object, required: true },
  deleting: { type: Boolean, default: false }
})

const emit = defineEmits(['confirm', 'cancel'])
const teleportDisabled = typeof document === 'undefined'

const projectName = computed(() => (
  normalizeProjectName(props.project?.name || props.project?.project_name) || '该项目'
))
const warning = computed(() => projectDeletionMessage(props.project))

function cancel() {
  if (!props.deleting) emit('cancel')
}
</script>

<style scoped>
.project-delete-dialog { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 24px; background: rgba(12, 34, 52, .46); backdrop-filter: blur(2px); }
.project-delete-dialog__panel { width: min(440px, 100%); box-sizing: border-box; padding: 24px; border: 1px solid var(--asc-border); border-radius: 14px; background: #fff; box-shadow: 0 24px 70px rgba(16, 48, 72, .22); }
.project-delete-dialog__eyebrow { color: #b43b32; font-size: 12px; font-weight: 800; letter-spacing: .08em; }
.project-delete-dialog h2 { margin: 10px 0 12px; color: var(--asc-heading); font-size: 20px; }
.project-delete-dialog p { margin: 0; color: var(--asc-muted); font-size: 14px; line-height: 1.7; }
.project-delete-dialog__actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
.project-delete-dialog__actions button { min-width: 88px; padding: 9px 14px; border: 1px solid var(--asc-border); border-radius: 7px; background: #fff; color: var(--asc-heading); font: inherit; font-weight: 700; cursor: pointer; }
.project-delete-dialog__actions button:disabled { cursor: wait; opacity: .6; }
.project-delete-dialog__actions .project-delete-dialog__confirm { border-color: #b43b32; background: #b43b32; color: #fff; }
</style>
