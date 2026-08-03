<template>
  <form class="composer" :class="{ 'composer--compact': compact }" @submit.prevent="$emit('submit')">
    <textarea
      :value="modelValue"
      :placeholder="compact ? '继续追问…' : '输入耐火材料问题，围绕配方、工艺、性能与服役机理展开研究…'"
      :rows="compact ? 2 : 4"
      aria-label="研究问题"
      @input="$emit('update:modelValue', $event.target.value)"
      @keydown.enter.exact.prevent="$emit('submit')"
    />

    <div class="composer__toolbar">
      <label class="composer-control composer-control--model">
        <span>模型</span>
        <select :value="settings.model" aria-label="模型" @change="updateSetting('model', $event.target.value)">
          <option v-for="model in domesticModelOptions" :key="model" :value="model">{{ model }}</option>
        </select>
      </label>

      <label class="composer-control">
        <span>框架</span>
        <select
          :value="settings.framework"
          aria-label="框架"
          @change="updateSetting('framework', $event.target.value)"
        >
          <option v-for="framework in frameworkOptions" :key="framework" :value="framework">
            {{ framework }}
          </option>
        </select>
      </label>

      <label class="composer-control">
        <span>推理</span>
        <select
          :value="settings.reasoning"
          aria-label="推理模式"
          @change="updateSetting('reasoning', $event.target.value)"
        >
          <option v-for="reasoning in reasoningOptions" :key="reasoning" :value="reasoning">
            {{ reasoning }}
          </option>
        </select>
      </label>

      <button
        class="ontology-toggle"
        :class="{ 'ontology-toggle--on': settings.ontologyEnabled }"
        type="button"
        :disabled="settings.ontologyLocked"
        :aria-pressed="settings.ontologyEnabled"
        :aria-disabled="settings.ontologyLocked"
        :title="settings.ontologyLocked ? 'NEXUS 框架默认启用本体增强' : '切换本体增强'"
        @click="updateSetting('ontologyEnabled', !settings.ontologyEnabled)"
      >
        本体增强
        <span>{{ settings.ontologyEnabled ? '开' : '关' }}</span>
      </button>

      <button class="send-button" type="submit" :disabled="disabled || !modelValue.trim()">
        <span>{{ disabled ? '生成中' : '发送' }}</span>
        <AscIcon name="send" />
      </button>
    </div>
  </form>
</template>

<script setup>
import AscIcon from '../../components/ui/AscIcon.vue'
import {
  domesticModelOptions,
  frameworkOptions,
  reasoningOptions
} from './qaDemoModel.js'

defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  settings: {
    type: Object,
    required: true
  },
  compact: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:modelValue',
  'update:settings',
  'submit'
])

function updateSetting(key, value) {
  emit('update:settings', { [key]: value })
}

</script>

<style scoped>
.composer {
  width: 100%;
  padding: 12px;
  border: 1px solid #b9cedd;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 34px rgba(39, 74, 99, 0.08);
}

.composer:focus-within {
  border-color: #6aa9d0;
  box-shadow: 0 0 0 3px rgba(8, 105, 173, 0.08), 0 16px 36px rgba(39, 74, 99, 0.09);
}

.composer textarea {
  width: 100%;
  min-height: 105px;
  resize: none;
  padding: 13px 14px 10px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--asc-heading);
  font-size: 15px;
  line-height: 1.7;
}

.composer--compact textarea {
  min-height: 52px;
  padding-top: 8px;
}

.composer textarea::placeholder {
  color: #91a3b4;
}

.composer__toolbar {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.composer-control,
.ontology-toggle {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-control-radius);
  background: #fff;
  color: var(--asc-text);
  font-size: 11px;
  font-weight: 650;
}

.composer-control select {
  max-width: 136px;
  padding: 0 14px 0 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--asc-heading);
  font-size: 11px;
  font-weight: 700;
}

.composer-control--model select {
  max-width: 190px;
}

.ontology-toggle span {
  color: var(--asc-muted);
}

.ontology-toggle--on {
  border-color: #9bcbe6;
  background: #eef8fd;
  color: var(--asc-primary);
}

.ontology-toggle--on span {
  color: var(--asc-primary);
}

.ontology-toggle:disabled {
  cursor: not-allowed;
  border-color: #c8dce8;
  background: #f1f7fb;
  opacity: 0.78;
}

.send-button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-left: auto;
  padding: 0 17px;
  border: 0;
  border-radius: 7px;
  background: var(--asc-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  transition: background var(--asc-transition), transform var(--asc-transition);
}

.send-button:hover:not(:disabled) {
  background: var(--asc-primary-hover);
  transform: translateY(-1px);
}

.send-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

@media (max-width: 980px) {
  .composer__toolbar {
    align-items: stretch;
  }

  .composer-control {
    flex: 1 1 132px;
  }

  .composer-control select {
    flex: 1;
    max-width: none;
  }
}

@media (max-width: 560px) {
  .composer {
    padding: 8px;
  }

  .composer textarea {
    min-height: 94px;
    padding-inline: 8px;
  }

  .composer-control,
  .ontology-toggle {
    flex: 1 1 calc(50% - 5px);
  }

  .send-button {
    width: 100%;
    margin-left: 0;
  }
}
</style>
