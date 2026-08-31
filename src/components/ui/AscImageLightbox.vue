<template>
  <div
    v-if="open"
    ref="dialog"
    class="asc-image-lightbox"
    role="dialog"
    aria-modal="true"
    :aria-label="alt ? `图片预览：${alt}` : '图片预览'"
    tabindex="-1"
    @click.self="$emit('close')"
    @keydown.esc.stop="$emit('close')"
  >
      <button
        type="button"
        class="asc-image-lightbox__close"
        aria-label="关闭图片预览"
        @click="$emit('close')"
      >
        <span aria-hidden="true">×</span>
      </button>

      <figure class="asc-image-lightbox__frame">
        <img :src="src" :alt="alt" @click.stop>
        <figcaption v-if="alt">{{ alt }}</figcaption>
      </figure>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  open: Boolean,
  src: {
    type: String,
    default: ''
  },
  alt: {
    type: String,
    default: ''
  }
})

defineEmits(['close'])

const dialog = ref(null)
let previousBodyOverflow = ''

function unlockPage() {
  if (typeof document === 'undefined' || !document.body?.style) return
  document.body.style.overflow = previousBodyOverflow
}

watch(() => props.open, async open => {
  if (!open) {
    unlockPage()
    return
  }
  if (typeof document !== 'undefined' && document.body?.style) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  await nextTick()
  dialog.value?.focus()
})

onBeforeUnmount(unlockPage)
</script>

<style scoped>
.asc-image-lightbox {
  position: fixed;
  z-index: 1200;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 56px 32px 28px;
  outline: none;
  background: rgba(7, 15, 25, .9);
  backdrop-filter: blur(7px);
  animation: ascImageLightboxIn .18s ease-out;
}

.asc-image-lightbox__close {
  position: fixed;
  top: 18px;
  right: 22px;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, .24);
  border-radius: 50%;
  background: rgba(255, 255, 255, .12);
  color: #fff;
  font: inherit;
  font-size: 27px;
  line-height: 1;
  cursor: pointer;
  transition: background .18s ease, transform .18s ease;
}

.asc-image-lightbox__close:hover,
.asc-image-lightbox__close:focus-visible {
  background: rgba(255, 255, 255, .22);
  outline: 2px solid rgba(255, 255, 255, .75);
  outline-offset: 2px;
  transform: scale(1.04);
}

.asc-image-lightbox__frame {
  max-width: min(94vw, 1480px);
  max-height: calc(100vh - 84px);
  display: grid;
  justify-items: center;
  gap: 10px;
  margin: 0;
}

.asc-image-lightbox__frame img {
  max-width: 100%;
  max-height: calc(100vh - 112px);
  display: block;
  border-radius: 8px;
  object-fit: contain;
  box-shadow: 0 20px 70px rgba(0, 0, 0, .48);
}

.asc-image-lightbox__frame figcaption {
  max-width: min(80vw, 920px);
  overflow: hidden;
  color: rgba(255, 255, 255, .82);
  font-size: 13px;
  line-height: 1.45;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes ascImageLightboxIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (max-width: 560px) {
  .asc-image-lightbox {
    padding: 60px 14px 24px;
  }

  .asc-image-lightbox__close {
    top: 12px;
    right: 14px;
  }
}
</style>
