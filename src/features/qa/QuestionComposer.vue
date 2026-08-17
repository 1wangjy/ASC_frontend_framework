<template>
  <div v-if="!compact || mode === 'multi'" class="composer-shell">
    <div v-if="!compact" class="composer-mode" role="group" aria-label="问答模式">
      <button
        v-for="option in qaModeOptions"
        :key="option.id"
        type="button"
        :class="{ active: mode === option.id }"
        :aria-pressed="mode === option.id"
        :disabled="modeDisabled"
        @click="$emit('update:mode', option.id)"
      >
        {{ option.label }}
      </button>
    </div>

    <form class="composer" :class="{ 'composer--compact': compact }" @submit.prevent="submit">
    <textarea
      :value="modelValue"
      :placeholder="compact ? '继续追问…' : '输入耐火材料问题，围绕配方、工艺、性能与服役机理展开研究…'"
      :rows="compact ? 2 : 4"
      aria-label="研究问题"
      @input="$emit('update:modelValue', $event.target.value)"
      @keydown.enter.exact.prevent="submit"
    />

    <div v-if="mode === 'multi' && selectedImage" class="multi-image-preview">
      <img :src="selectedImage.url" :alt="selectedImage.name" />
      <span :title="selectedImage.name">{{ selectedImage.name }}</span>
      <button type="button" aria-label="删除图片" @click="removeImage">
        <span aria-hidden="true">×</span>
        <span class="sr-only">删除图片</span>
      </button>
    </div>

    <div class="composer__toolbar">
      <button
        v-if="mode === 'multi'"
        class="attachment-button"
        type="button"
        aria-label="选择图片"
        title="选择图片"
        @click="fileInput?.click()"
      >
        +
      </button>
      <input
        v-if="mode === 'multi'"
        ref="fileInput"
        class="file-input"
        type="file"
        accept="image/*"
        @change="selectImage"
      />

      <label class="composer-control composer-control--model">
        <span>模型</span>
        <select :value="settings.model" aria-label="模型" @change="updateSetting('model', $event.target.value)">
          <option v-for="model in domesticModelOptions" :key="model" :value="model">{{ model }}</option>
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

      <label v-if="mode === 'multi'" class="composer-control composer-control--module">
        <span>多模块回答</span>
        <select
          :value="multiModule"
          aria-label="多模块回答"
          @change="multiModule = $event.target.value"
        >
          <option value="inline">正文穿插</option>
          <option value="evidence">证据区域</option>
        </select>
      </label>

      <button
        v-if="mode === 'single'"
        class="send-button"
        type="submit"
        :disabled="disabled || !modelValue.trim()"
      >
        <span>查询</span>
        <AscIcon name="send" />
      </button>
      <button
        v-if="mode === 'multi'"
        class="send-button"
        type="submit"
        disabled
        title="多轮问答接口尚未接入"
      >
        <span>发送</span>
        <AscIcon name="send" />
      </button>
    </div>
    </form>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'
import {
  domesticModelOptions,
  qaModeOptions,
  reasoningOptions
} from './qaDemoModel.js'

const props = defineProps({
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
  },
  mode: {
    type: String,
    default: 'single'
  },
  modeDisabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:modelValue',
  'update:settings',
  'update:mode',
  'submit'
])

const fileInput = ref(null)
const selectedImage = ref(null)
const multiModule = ref('inline')

function updateSetting(key, value) {
  emit('update:settings', { [key]: value })
}

function submit() {
  if (props.mode !== 'single' || props.disabled || !props.modelValue.trim()) return
  emit('submit')
}

function releaseSelectedImage() {
  if (selectedImage.value?.url) URL.revokeObjectURL(selectedImage.value.url)
}

function selectImage(event) {
  const image = event?.target?.files?.[0]
  if (!image || !String(image.type || '').startsWith('image/')) return

  releaseSelectedImage()
  selectedImage.value = {
    name: image.name,
    url: URL.createObjectURL(image)
  }
}

function removeImage() {
  releaseSelectedImage()
  selectedImage.value = null
  if (fileInput.value) fileInput.value.value = ''
}

onBeforeUnmount(releaseSelectedImage)

</script>

<style scoped>
.composer-shell {
  width: 100%;
  display: grid;
  gap: 12px;
}

.composer-mode {
  width: fit-content;
  display: inline-flex;
  justify-self: center;
  padding: 4px;
  border: 1px solid var(--asc-border);
  border-radius: 10px;
  background: rgba(255, 255, 255, .72);
}

.composer-mode button {
  min-height: 34px;
  padding: 0 18px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--asc-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 750;
  cursor: pointer;
}

.composer-mode button.active {
  background: var(--asc-primary);
  color: #fff;
  box-shadow: 0 4px 12px rgba(8, 105, 173, .18);
}

.composer-mode button:disabled {
  cursor: not-allowed;
  opacity: .58;
}

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

.multi-image-preview {
  width: fit-content;
  max-width: min(100%, 360px);
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 9px;
  margin: 0 12px 12px;
  padding: 7px;
  border: 1px solid var(--asc-border);
  border-radius: 9px;
  background: #f7fbfe;
}

.multi-image-preview img {
  width: 46px;
  height: 46px;
  border-radius: 6px;
  object-fit: cover;
}

.multi-image-preview > span {
  overflow: hidden;
  color: var(--asc-text);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.multi-image-preview button,
.attachment-button {
  border: 1px solid var(--asc-border);
  background: #fff;
  color: var(--asc-text);
  cursor: pointer;
}

.multi-image-preview button {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 18px;
  line-height: 1;
}

.sr-only,
.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.composer__toolbar {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.attachment-button {
  width: 34px;
  height: 34px;
  border-radius: var(--asc-control-radius);
  font-size: 21px;
  line-height: 1;
}

.composer-control {
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

.composer-control--module select {
  max-width: 92px;
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

  .composer-control {
    flex: 1 1 calc(50% - 5px);
  }

  .composer-mode {
    width: 100%;
  }

  .composer-mode button {
    flex: 1;
  }

  .send-button {
    width: 100%;
    margin-left: 0;
  }

}
</style>
