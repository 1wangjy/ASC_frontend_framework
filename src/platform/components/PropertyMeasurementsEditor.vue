<template>
  <div class="property-editor">
    <div class="property-editor__workspace">
      <aside class="property-editor__sidebar">
        <nav v-if="definitions.length" class="property-editor__nav" aria-label="属性导航">
          <button
            v-for="definition in definitions"
            :key="definition.name"
            type="button"
            class="property-editor__nav-item"
            :class="{
              'property-editor__nav-item--active': activeNavigationKey === definition.name,
              'property-editor__nav-item--available': !isPropertyActive(definition.name),
            }"
            :title="isPropertyActive(definition.name) ? `定位到${definition.label}` : `添加${definition.label}`"
            @click="activateProperty(definition.name)"
          >
            {{ definition.label }}
          </button>
        </nav>
      </aside>

      <div class="property-editor__content">
        <p class="property-editor__guide">
          <span>每行代表一次测量，英文分号作为分隔符，TAB 单位符号自动补全。</span>
          <span class="property-editor__guide-note">RT 表示常温，N/A 表示不适用。</span>
        </p>

        <div
          ref="groupsScroller"
          class="property-editor__groups-scroll"
          @scroll="syncActiveNavigation"
        >
          <div v-if="groups.length" class="property-editor__groups">
            <section
              v-for="group in groups"
              :key="group.definition.name"
              :ref="element => setGroupElement(group.definition.name, element)"
              class="property-editor__group"
            >
              <header class="property-editor__group-header">
                <strong>{{ group.definition.label }}</strong>
              </header>
              <p class="property-editor__hint">{{ getMeasurementInputHint(group.definition) }}</p>
              <div class="property-editor__textarea-shell">
                <textarea
                  class="property-editor__textarea"
                  :value="drafts[group.definition.name] || ''"
                  rows="4"
                  :placeholder="group.definition.inputExample || '每行输入一次测量'"
                  @input="handleDraftInput(group.definition, $event)"
                  @keydown.tab="handleTabCompletion(group.definition, $event)"
                  @keyup="updateGhost(group.definition, $event.target)"
                  @click="updateGhost(group.definition, $event.target)"
                  @focus="updateGhost(group.definition, $event.target)"
                  @scroll="updateGhost(group.definition, $event.target)"
                  @blur="handleDraftBlur(group.definition)"
                />
                <div
                  v-if="ghosts[group.definition.name]?.text"
                  class="property-editor__ghost-layer"
                  aria-hidden="true"
                >
                  <div
                    class="property-editor__ghost-content"
                    :style="{
                      transform: `translate(${-ghosts[group.definition.name].scrollLeft}px, ${-ghosts[group.definition.name].scrollTop}px)`,
                    }"
                  >
                    <span class="property-editor__ghost-prefix">{{ ghosts[group.definition.name].prefix }}</span><span class="property-editor__ghost-text">{{ ghosts[group.definition.name].text }}</span>
                  </div>
                </div>
              </div>
              <p v-if="errors[group.definition.name]" class="property-editor__error">
                {{ errors[group.definition.name] }}
              </p>
            </section>
          </div>
          <div v-else class="property-editor__empty">请选择一个属性并添加编辑区</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  completeMeasurementInput,
  createEmptyPropertyDocument,
  getMeasurementCompletionSuggestion,
  getMeasurementInputHint,
  measurementToInputLine,
  normalizePropertyDocument,
  parseMeasurementInput,
  replacePropertyMeasurements,
} from '../utils/propertyMeasurements.js'

const props = defineProps({
  modelValue: { type: Object, default: () => createEmptyPropertyDocument() },
  definitions: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'validity-change'])
const documentValue = ref(createEmptyPropertyDocument())
const activePropertyKeys = ref([])
const drafts = ref({})
const errors = ref({})
const ghosts = ref({})
const activeNavigationKey = ref('')
const groupsScroller = ref(null)
const groupElements = new Map()
let lastEmittedDocument = ''

const groups = computed(() => activePropertyKeys.value.map(key => {
  const definition = props.definitions.find(item => item.name === key)
  return definition ? { definition } : null
}).filter(Boolean))

watch(
  () => [props.modelValue, props.definitions],
  () => {
    documentValue.value = normalizePropertyDocument(props.modelValue, props.definitions)
    const incomingDocument = JSON.stringify(documentValue.value)
    if (incomingDocument === lastEmittedDocument) {
      lastEmittedDocument = ''
      return
    }
    const keys = Object.keys(documentValue.value.properties || {}).filter(key => (
      props.definitions.some(definition => definition.name === key)
    ))
    activePropertyKeys.value = keys
    drafts.value = Object.fromEntries(keys.map(key => {
      const definition = props.definitions.find(item => item.name === key)
      const text = (documentValue.value.properties[key] || [])
        .map(measurement => measurementToInputLine(measurement, definition))
        .join('\n')
      return [key, text]
    }))
    errors.value = {}
    ghosts.value = {}
    activeNavigationKey.value = keys.includes(activeNavigationKey.value)
      ? activeNavigationKey.value
      : (keys[0] || '')
    emit('validity-change', true)
  },
  { deep: true, immediate: true },
)

function emitDocument(document) {
  documentValue.value = document
  lastEmittedDocument = JSON.stringify(document)
  emit('update:modelValue', document)
}

function emitValidity() {
  emit('validity-change', !Object.values(errors.value).some(Boolean))
}

function isPropertyActive(key) {
  return activePropertyKeys.value.includes(key)
}

async function activateProperty(key) {
  if (!key) return
  if (!isPropertyActive(key)) {
    activePropertyKeys.value = [...activePropertyKeys.value, key]
    drafts.value = { ...drafts.value, [key]: '' }
    errors.value = { ...errors.value, [key]: '' }
  }
  activeNavigationKey.value = key
  await nextTick()
  scrollToProperty(key)
}

function setGroupElement(key, element) {
  if (element) groupElements.set(key, element)
  else groupElements.delete(key)
}

function scrollToProperty(key, behavior = 'smooth') {
  activeNavigationKey.value = key
  const scroller = groupsScroller.value
  const element = groupElements.get(key)
  if (!scroller || !element) return
  scroller.scrollTo({
    top: Math.max(0, element.offsetTop - 4),
    behavior,
  })
}

function syncActiveNavigation(event) {
  const scroller = event.currentTarget
  let activeKey = activePropertyKeys.value[0] || ''
  for (const key of activePropertyKeys.value) {
    const element = groupElements.get(key)
    if (element && element.offsetTop <= scroller.scrollTop + 24) activeKey = key
  }
  activeNavigationKey.value = activeKey
}

function updateDraft(definition, value) {
  const key = definition.name
  drafts.value = { ...drafts.value, [key]: value }
  const lines = value.split('\n').map(line => line.trim()).filter(Boolean)
  try {
    const measurements = lines.map((line, index) => {
      try { return parseMeasurementInput(line, definition) }
      catch (error) { throw new Error(`第 ${index + 1} 行：${error.message}`) }
    })
    errors.value = { ...errors.value, [key]: '' }
    emitDocument(replacePropertyMeasurements(documentValue.value, key, measurements, props.definitions))
  } catch (error) {
    errors.value = { ...errors.value, [key]: error.message || '输入格式不正确' }
  }
  emitValidity()
}

function handleDraftInput(definition, event) {
  updateDraft(definition, event.target.value)
  updateGhost(definition, event.target)
}

function clearGhost(key) {
  if (!ghosts.value[key]) return
  const nextGhosts = { ...ghosts.value }
  delete nextGhosts[key]
  ghosts.value = nextGhosts
}

function updateGhost(definition, target) {
  const key = definition.name
  if (!target || target.selectionStart !== target.selectionEnd) {
    clearGhost(key)
    return
  }
  const text = getMeasurementCompletionSuggestion(target.value, target.selectionStart, definition)
  if (!text) {
    clearGhost(key)
    return
  }
  ghosts.value = {
    ...ghosts.value,
    [key]: {
      prefix: target.value.slice(0, target.selectionStart),
      text,
      scrollTop: target.scrollTop || 0,
      scrollLeft: target.scrollLeft || 0,
    },
  }
}

function handleTabCompletion(definition, event) {
  const target = event.target
  if (!target || target.selectionStart !== target.selectionEnd) return
  const completed = completeMeasurementInput(target.value, target.selectionStart, definition)
  if (!completed) return

  event.preventDefault()
  target.value = completed.value
  updateDraft(definition, completed.value)
  requestAnimationFrame(() => {
    target.focus()
    target.setSelectionRange(completed.caret, completed.caret)
    updateGhost(definition, target)
  })
}

function normalizeDraft(definition) {
  const key = definition.name
  if (errors.value[key]) return
  const normalizedText = (documentValue.value.properties?.[key] || [])
    .map(measurement => measurementToInputLine(measurement, definition))
    .join('\n')
  drafts.value = { ...drafts.value, [key]: normalizedText }
}

function handleDraftBlur(definition) {
  clearGhost(definition.name)
  normalizeDraft(definition)
}

</script>

<style scoped>
.property-editor { min-width: 0; }
.property-editor__workspace { display: grid; grid-template-columns: 164px minmax(0, 1fr); gap: 12px; height: clamp(330px, 56vh, 520px); min-height: 0; }
.property-editor__sidebar { display: flex; box-sizing: border-box; min-width: 0; min-height: 0; overflow: hidden; padding: 10px; border: 1px solid #dbe4ee; border-radius: 9px; background: #f8fafc; }
.property-editor__nav { display: grid; flex: 1; align-content: start; gap: 6px; min-height: 0; overflow-y: auto; padding-right: 3px; }
.property-editor__nav-item { width: 100%; padding: 8px 10px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: #52667a; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; transition: background .16s ease, border-color .16s ease, color .16s ease; }
.property-editor__nav-item:hover { border-color: #bfdbfe; background: #eff6ff; color: #075da7; }
.property-editor__nav-item--active { border-color: #93c5fd; background: #e7f2ff; color: #075da7; }
.property-editor__nav-item--available { color: #718096; font-weight: 500; }
.property-editor__content { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 10px; min-width: 0; min-height: 0; }
.property-editor__guide { margin: 0; padding: 9px 11px; border-radius: 7px; background: #eff6ff; color: #16803a; font-size: 12px; font-weight: 600; line-height: 1.6; }
.property-editor__guide > span { display: inline; }
.property-editor__guide-note { margin-left: 8px; }
.property-editor__groups-scroll { position: relative; min-height: 0; overflow-y: auto; padding-right: 6px; scroll-behavior: smooth; }
.property-editor__groups { display: grid; gap: 10px; }
.property-editor__group { padding: 11px 12px; border: 1px solid #dbe4ee; border-radius: 9px; background: #f8fafc; }
.property-editor__group-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.property-editor__group-header strong { color: #243b53; font-size: 14px; }
.property-editor__hint { margin: 7px 0; color: #64748b; font-size: 12px; line-height: 1.55; }
.property-editor__textarea-shell { position: relative; }
.property-editor__textarea { position: relative; z-index: 1; display: block; box-sizing: border-box; width: 100%; height: 112px; min-height: 112px; max-height: 112px; resize: none; overflow-y: auto; padding: 10px 11px; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; color: #1e293b; font: 13px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; }
.property-editor__textarea:focus { border-color: var(--asc-primary); outline: 2px solid var(--asc-primary-soft); }
.property-editor__ghost-layer { position: absolute; z-index: 2; inset: 1px; overflow: hidden; border-radius: 6px; pointer-events: none; }
.property-editor__ghost-content { box-sizing: border-box; width: 100%; padding: 10px 11px; color: transparent; white-space: pre-wrap; overflow-wrap: break-word; font: 13px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; }
.property-editor__ghost-prefix { color: transparent; }
.property-editor__ghost-text { color: #94a3b8; opacity: .82; }
.property-editor__error { margin: 7px 0 0; color: #b91c1c; font-size: 12px; }
.property-editor__empty { padding: 16px; border: 1px dashed #cbd5e1; border-radius: 8px; color: #94a3b8; text-align: center; }
@media (max-width:760px) {
  .property-editor__workspace { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); height: min(68vh, 560px); }
  .property-editor__nav { display: flex; overflow-x: auto; overflow-y: hidden; padding: 0 0 2px; }
  .property-editor__nav-item { width: auto; flex: 0 0 auto; white-space: nowrap; }
}
</style>
