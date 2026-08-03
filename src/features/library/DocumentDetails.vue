<template>
  <aside v-if="document" class="document-details">
    <header>
      <h2>文献详情</h2>
      <button type="button" aria-label="关闭文献详情" @click="$emit('close')">
        <AscIcon name="close" />
      </button>
    </header>

    <div class="document-heading">
      <div class="pdf-cover"><strong>PDF</strong><span>ASC LAB</span></div>
      <div>
        <h3>{{ document.title }}</h3>
        <p>{{ document.authors.join(', ') }}</p>
        <span>{{ document.year }}</span>
      </div>
    </div>

    <dl>
      <div><dt>DOI</dt><dd>{{ document.doi }}</dd></div>
      <div><dt>期刊</dt><dd>{{ document.journal }}</dd></div>
      <div><dt>页码</dt><dd>{{ document.pages }}</dd></div>
      <div><dt>语言</dt><dd>{{ document.language }}</dd></div>
      <div><dt>知识层级</dt><dd>{{ document.knowledgeLevel }}</dd></div>
      <div><dt>引用次数</dt><dd>{{ document.citationCount }} 次 QA 引用</dd></div>
    </dl>

    <section class="pipeline">
      <h4>处理流水线</h4>
      <div>
        <template v-for="(step, index) in pipeline" :key="step">
          <span class="pipeline__step" :class="{ pending: isPending(index) }">
            <i><AscIcon name="check" /></i>
            {{ step }}
          </span>
          <AscIcon v-if="index < pipeline.length - 1" class="pipeline__arrow" name="chevron" />
        </template>
      </div>
    </section>

    <section class="chunk">
      <span>可引用片段预览 · CHUNK 0044</span>
      <p>{{ document.chunk }}</p>
    </section>

    <div class="detail-actions">
      <button type="button" class="secondary" @click="$emit('preview', document)">预览 PDF</button>
      <button
        type="button"
        class="primary"
        :disabled="document.qaIndexed"
        @click="$emit('add-to-qa', document.id)"
      >
        {{ document.qaIndexed ? '已加入 QA 证据库' : '加入 QA 证据库' }}
      </button>
    </div>
  </aside>
</template>

<script setup>
import AscIcon from '../../components/ui/AscIcon.vue'

const props = defineProps({
  document: {
    type: Object,
    default: null
  }
})

defineEmits(['close', 'preview', 'add-to-qa'])

const pipeline = ['上传', '解析', '切片', '索引']

function isPending(index) {
  if (props.document.parsingStatus === 'indexed') return false
  if (props.document.parsingStatus === 'reindex') return index === 3
  return index > 0
}
</script>

<style scoped>
.document-details {
  min-width: 0;
  min-height: 650px;
  display: flex;
  flex-direction: column;
  padding: 20px 16px;
  overflow-y: auto;
  border: 1px solid var(--asc-border);
  border-radius: var(--asc-radius);
  background: #fff;
}

.document-details > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--asc-border);
}

.document-details h2 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 15px;
}

.document-details > header button {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--asc-text);
  font-size: 18px;
}

.document-heading {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 12px;
  margin-top: 16px;
}

.pdf-cover {
  height: 92px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 9px;
  border: 1px solid #d0dbe4;
  border-radius: 7px;
  background: #f9fbfd;
}

.pdf-cover strong {
  padding: 5px 6px;
  border-radius: 4px;
  background: #cd4242;
  color: #fff;
  font-size: 10px;
}

.pdf-cover span {
  color: #91a2b1;
  font-size: 8px;
}

.document-heading h3 {
  margin: 2px 0 8px;
  color: var(--asc-heading);
  font-size: 12px;
  line-height: 1.45;
}

.document-heading p,
.document-heading span {
  margin: 0;
  color: var(--asc-muted);
  font-size: 9px;
}

dl {
  display: grid;
  gap: 9px;
  margin: 20px 0 0;
}

dl div {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 8px;
}

dt,
dd {
  margin: 0;
  font-size: 9px;
  line-height: 1.5;
}

dt {
  color: var(--asc-muted);
}

dd {
  overflow-wrap: anywhere;
  color: var(--asc-text);
}

.pipeline {
  margin-top: 20px;
}

.pipeline h4 {
  margin: 0 0 12px;
  color: var(--asc-heading);
  font-size: 11px;
}

.pipeline > div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.pipeline__step {
  display: grid;
  justify-items: center;
  gap: 5px;
  color: var(--asc-text);
  font-size: 8px;
}

.pipeline__step i {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--asc-success);
  color: #fff;
  font-size: 12px;
}

.pipeline__step.pending i {
  background: #c7d3dc;
}

.pipeline__arrow {
  margin-top: 7px;
  color: #9babb7;
  font-size: 10px;
}

.chunk {
  margin-top: 20px;
}

.chunk span {
  color: var(--asc-primary);
  font-size: 9px;
  font-weight: 800;
}

.chunk p {
  margin: 7px 0 0;
  padding: 10px;
  border-left: 3px solid #4c9fce;
  background: #f5f9fc;
  color: var(--asc-text);
  font-size: 9px;
  line-height: 1.6;
}

.detail-actions {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 8px;
  margin-top: auto;
  padding-top: 20px;
}

.detail-actions button {
  min-height: 40px;
  border-radius: 7px;
  font-size: 10px;
  font-weight: 800;
}

.detail-actions .secondary {
  border: 1px solid #8fb9d3;
  background: #fff;
  color: var(--asc-primary);
}

.detail-actions .primary {
  border: 0;
  background: var(--asc-primary);
  color: #fff;
}

.detail-actions button:disabled {
  cursor: default;
  background: var(--asc-success-soft);
  color: var(--asc-success);
}

@media (max-width: 1180px) {
  .document-details {
    position: fixed;
    z-index: 32;
    inset: 0 0 0 auto;
    width: min(380px, 94vw);
    min-height: 100vh;
    border-radius: 0;
    box-shadow: var(--asc-shadow);
  }
}
</style>
