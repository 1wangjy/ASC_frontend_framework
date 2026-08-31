<template>
  <div v-if="!compact || mode === 'multi'" class="composer-shell">
    <QaModeSwitcher
      v-if="!compact"
      :mode="mode"
      :disabled="modeDisabled"
      @update:mode="$emit('update:mode', $event)"
    />

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
      <button
        type="button"
        class="multi-image-preview__zoom"
        :aria-label="`放大查看 ${selectedImage.name}`"
        @click="previewOpen = true"
      >
        <img :src="selectedImage.url" :alt="selectedImage.name" />
        <span class="sr-only">放大查看 {{ selectedImage.name }}</span>
      </button>
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
          <option v-for="option in normalizedModelOptions" :key="option.value" :value="option.value">
            {{ option.label }}
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
        v-if="mode === 'multi'"
        type="button"
        class="multimodal-answer-toggle"
        :class="{ 'is-active': enableMultimodalResponse }"
        :aria-pressed="enableMultimodalResponse"
        :disabled="disabled"
        title="开启后，回答生成前会检索高相关视觉证据，并用于证据约束与图文布局"
        @click="enableMultimodalResponse = !enableMultimodalResponse"
      >
        <span aria-hidden="true">🖼️</span>
        <strong>多模态回答</strong>
        <small>{{ enableMultimodalResponse ? '已开启' : '已关闭' }}</small>
      </button>
      <div
        v-if="mode === 'multi' && enableMultimodalResponse"
        class="multimodal-render-mode"
        role="group"
        aria-label="多模态回答图片展示方式"
      >
        <button
          type="button"
          :class="{ 'is-active': multiModule === 'inline' }"
          :aria-pressed="multiModule === 'inline'"
          :disabled="disabled"
          @click="multiModule = 'inline'"
        >
          正文穿插
        </button>
        <button
          type="button"
          :class="{ 'is-active': multiModule === 'evidence' }"
          :aria-pressed="multiModule === 'evidence'"
          :disabled="disabled"
          @click="multiModule = 'evidence'"
        >
          证据区域
        </button>
      </div>

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
        :disabled="disabled || (!modelValue.trim() && !selectedImage)"
      >
        <span>发送</span>
        <AscIcon name="send" />
      </button>
    </div>
    </form>

    <AscImageLightbox
      :open="previewOpen"
      :src="selectedImage?.url || ''"
      :alt="selectedImage?.name || ''"
      @close="previewOpen = false"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'
import AscImageLightbox from '../../components/ui/AscImageLightbox.vue'
import QaModeSwitcher from './QaModeSwitcher.vue'
import {
  domesticModelOptions,
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
  },
  modelOptions: {
    type: Array,
    default: () => domesticModelOptions.map(value => ({ value, label: value }))
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
const previewOpen = ref(false)
const enableMultimodalResponse = ref(false)
const multiModule = ref('inline')
const normalizedModelOptions = computed(() => props.modelOptions
  .map(option => typeof option === 'string'
    ? { value: option, label: option }
    : {
        value: String(option?.value || ''),
        label: String(option?.label || option?.value || '')
      })
  .filter(option => option.value && option.label))

function updateSetting(key, value) {
  emit('update:settings', { [key]: value })
}

function submit() {
  if (props.disabled) return
  if (props.mode === 'multi') {
    if (!props.modelValue.trim() && !selectedImage.value?.file) return
    emit('submit', {
      question: props.modelValue.trim(),
      image: selectedImage.value?.file || null,
      enableMultimodalResponse: enableMultimodalResponse.value,
      multiModule: multiModule.value
    })
    removeImage()
    return
  }
  if (props.modelValue.trim()) emit('submit')
}

function releaseSelectedImage() {
  if (selectedImage.value?.url) URL.revokeObjectURL(selectedImage.value.url)
}

function selectImage(event) {
  const image = event?.target?.files?.[0]
  if (!image || !String(image.type || '').startsWith('image/')) return

  releaseSelectedImage()
  selectedImage.value = {
    file: image,
    name: image.name,
    url: URL.createObjectURL(image)
  }
}

function removeImage() {
  previewOpen.value = false
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

.multi-image-preview__zoom {
  width: 46px;
  height: 46px;
  display: block;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: zoom-in;
}

.multi-image-preview__zoom:focus-visible {
  outline: 2px solid var(--asc-primary);
  outline-offset: 2px;
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

.multimodal-answer-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 5px 9px;
  border: 1px solid #cbd3df;
  border-radius: 9px;
  background: #f8fafc;
  color: #556278;
  font: inherit;
  cursor: pointer;
  transition: border-color .18s ease, background .18s ease, color .18s ease;
}

.multimodal-answer-toggle strong {
  font-size: 9px;
}

.multimodal-answer-toggle small {
  padding-left: 6px;
  border-left: 1px solid currentColor;
  font-size: 8px;
  opacity: .72;
}

.multimodal-answer-toggle.is-active {
  border-color: #43a789;
  background: #eaf8f3;
  color: #08775a;
  box-shadow: 0 0 0 2px rgba(36, 165, 125, .08);
}

.multimodal-answer-toggle:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.multimodal-render-mode {
  display: inline-flex;
  padding: 2px;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #f4f6f9;
}

.multimodal-render-mode button {
  min-height: 25px;
  padding: 3px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #6a7689;
  font: inherit;
  font-size: 8px;
  font-weight: 800;
  cursor: pointer;
}

.multimodal-render-mode button.is-active {
  background: #fff;
  color: #4e50bd;
  box-shadow: 0 1px 4px rgba(51, 62, 85, .13);
}

.multimodal-render-mode button:disabled {
  cursor: not-allowed;
  opacity: .55;
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

  .send-button {
    width: 100%;
    margin-left: 0;
  }

}
</style>
