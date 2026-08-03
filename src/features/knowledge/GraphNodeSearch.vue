<template>
  <div class="node-search">
    <label class="node-search__field">
      <AscIcon name="search" />
      <input
        v-model="query"
        type="search"
        placeholder="搜索节点名称、别名或节点 ID…"
        aria-label="搜索知识图谱节点"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="resultsOpen"
        aria-controls="graph-node-results"
        :aria-activedescendant="activeResultId"
        @focus="openResults"
        @input="openResults"
        @keydown="handleKeydown"
      />
    </label>

    <div v-if="resultsOpen" id="graph-node-results" class="node-results" role="listbox">
      <button
        v-for="(node, index) in results"
        :id="`graph-result-${index}`"
        :key="node.nodeId"
        type="button"
        role="option"
        :aria-selected="index === activeIndex"
        :class="{ active: index === activeIndex }"
        @mouseenter="activeIndex = index"
        @mousedown.prevent="choose(node)"
      >
        <span class="node-results__icon">{{ node.type.slice(0, 1) }}</span>
        <span class="node-results__copy">
          <strong>{{ node.label }}</strong>
          <small>{{ node.nodeId }}</small>
        </span>
        <em>{{ node.type }}</em>
      </button>

      <div v-if="!results.length" class="node-results__empty">
        未找到节点，请尝试名称、别名或节点 ID
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'
import { searchGraphNodes } from './graphExplorerModel.js'

const props = defineProps({
  nodes: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['select'])
const query = ref('')
const open = ref(false)
const activeIndex = ref(0)

const results = computed(() => searchGraphNodes(props.nodes, query.value))
const resultsOpen = computed(() => open.value && Boolean(query.value.trim()))
const activeResultId = computed(() => (
  resultsOpen.value && results.value.length ? `graph-result-${activeIndex.value}` : undefined
))

function openResults() {
  open.value = true
  activeIndex.value = 0
}

function choose(node) {
  query.value = node.label
  open.value = false
  activeIndex.value = 0
  emit('select', node.nodeId)
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    open.value = false
    return
  }

  if (!resultsOpen.value || !results.value.length) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % results.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + results.value.length) % results.value.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    choose(results.value[activeIndex.value])
  }
}
</script>

<style scoped>
.node-search {
  position: relative;
  z-index: 8;
  width: min(620px, 100%);
}

.node-search__field {
  height: 42px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 13px;
  border: 1px solid #a9c8da;
  border-radius: 8px;
  background: #fff;
  color: var(--asc-primary);
}

.node-search__field:focus-within {
  border-color: #5ea1c8;
  box-shadow: 0 0 0 3px rgba(8, 105, 173, 0.08);
}

.node-search__field input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--asc-heading);
  font-size: 12px;
}

.node-results {
  position: absolute;
  inset: calc(100% + 7px) 0 auto;
  display: grid;
  gap: 3px;
  padding: 6px;
  border: 1px solid #c5d9e6;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 15px 32px rgba(21, 61, 86, 0.16);
}

.node-results button {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--asc-text);
  text-align: left;
}

.node-results button.active {
  background: #edf7fc;
}

.node-results__icon {
  width: 29px;
  height: 29px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--asc-primary-soft);
  color: var(--asc-primary);
  font-size: 10px;
  font-weight: 900;
}

.node-results__copy {
  min-width: 0;
}

.node-results strong,
.node-results small {
  display: block;
}

.node-results strong {
  color: var(--asc-heading);
  font-size: 11px;
}

.node-results small {
  margin-top: 2px;
  overflow: hidden;
  color: var(--asc-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-results em {
  padding: 3px 6px;
  border-radius: 5px;
  background: #f0f4f7;
  color: #647f91;
  font-size: 8px;
  font-style: normal;
}

.node-results__empty {
  padding: 18px 12px;
  color: var(--asc-muted);
  font-size: 10px;
  text-align: center;
}
</style>
