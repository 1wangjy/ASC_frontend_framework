<template>
  <main class="module-page">
    <header>
      <div>
        <h1>{{ module.title }}</h1>
        <p>{{ module.description }}</p>
      </div>
      <span class="module-status"><i />{{ module.status }}</span>
    </header>

    <section class="module-workspace">
      <nav aria-label="模块分类">
        <button
          v-for="(item, index) in module.items"
          :key="item.title"
          type="button"
          :class="{ active: selectedIndex === index }"
          @click="selectedIndex = index"
        >
          <span>0{{ index + 1 }}</span>
          <div>
            <strong>{{ item.title }}</strong>
            <small>{{ item.subtitle }}</small>
          </div>
          <AscIcon name="chevron" />
        </button>
      </nav>

      <article class="module-detail">
        <div class="module-detail__copy">
          <span>{{ module.title }} / {{ selectedItem.title }}</span>
          <h2>{{ selectedItem.title }}</h2>
          <p>{{ selectedItem.description }}</p>

          <div class="detail-list">
            <div v-for="detail in selectedItem.details" :key="detail">
              <AscIcon name="check" />
              <span>{{ detail }}</span>
            </div>
          </div>
        </div>

        <div class="module-diagram" :class="`module-diagram--${moduleKey}`">
          <template v-if="moduleKey === 'knowledge'">
            <div class="diagram-node diagram-node--center">{{ selectedItem.title }}</div>
            <div
              v-for="(detail, index) in selectedItem.details"
              :key="detail"
              class="diagram-node"
              :class="`diagram-node--${index + 1}`"
            >
              {{ detail }}
            </div>
          </template>

          <template v-else-if="moduleKey === 'data'">
            <div v-for="(detail, index) in selectedItem.details" :key="detail" class="data-row">
              <span>{{ detail }}</span>
              <i :style="{ width: `${78 - index * 9}%` }" />
              <strong>{{ index === 0 ? '结构化' : '待接入' }}</strong>
            </div>
          </template>

          <template v-else>
            <div class="model-stack">
              <span>输入层</span>
              <AscIcon name="chevron" />
              <span class="active">ASC 专业能力</span>
              <AscIcon name="chevron" />
              <span>评估与输出</span>
            </div>
            <p>模型接口将在后端服务确定后接入；当前页面只展示能力边界。</p>
          </template>
        </div>
      </article>
    </section>

    <footer>
      <strong>首版范围</strong>
      <span>本页面已完成路由、布局和交互状态，未展示未经后端返回的研究结果。</span>
    </footer>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import AscIcon from '../../components/ui/AscIcon.vue'
import { moduleCatalog } from './moduleCatalog.js'

const props = defineProps({
  moduleKey: {
    type: String,
    required: true
  }
})

const selectedIndex = ref(0)
const module = computed(() => moduleCatalog[props.moduleKey])
const selectedItem = computed(() => module.value.items[selectedIndex.value])
</script>

<style scoped>
.module-page {
  min-height: 100vh;
  display: grid;
  align-content: start;
  gap: 18px;
  padding: 30px;
}

.module-page > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.module-page h1 {
  margin: 0;
  color: var(--asc-heading);
  font-size: 28px;
}

.module-page header p {
  max-width: 700px;
  margin: 7px 0 0;
  color: var(--asc-muted);
  font-size: 12px;
}

.module-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border: 1px solid #bdd9ca;
  border-radius: 6px;
  background: var(--asc-success-soft);
  color: var(--asc-success);
  font-size: 10px;
  font-weight: 750;
}

.module-status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.module-workspace {
  min-height: 610px;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--asc-border);
  border-radius: 10px;
  background: #fff;
}

.module-workspace nav {
  padding: 16px;
  border-right: 1px solid var(--asc-border);
  background: #f8fbfd;
}

.module-workspace nav button {
  width: 100%;
  min-height: 78px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 9px;
  padding: 11px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--asc-muted);
  text-align: left;
}

.module-workspace nav button + button {
  margin-top: 7px;
}

.module-workspace nav button.active {
  border-color: #b8d6e9;
  background: #fff;
  color: var(--asc-primary);
  box-shadow: 0 8px 22px rgba(28, 73, 104, 0.07);
}

.module-workspace nav button > span {
  font-size: 11px;
  font-weight: 900;
}

.module-workspace nav strong,
.module-workspace nav small {
  display: block;
}

.module-workspace nav strong {
  color: var(--asc-heading);
  font-size: 12px;
}

.module-workspace nav small {
  margin-top: 4px;
  overflow: hidden;
  color: var(--asc-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.module-detail {
  display: grid;
  grid-template-columns: minmax(260px, 0.85fr) minmax(360px, 1.15fr);
  gap: 44px;
  align-items: center;
  padding: 54px;
}

.module-detail__copy > span {
  color: var(--asc-primary);
  font-size: 10px;
  font-weight: 850;
}

.module-detail h2 {
  margin: 10px 0;
  color: var(--asc-heading);
  font-size: 32px;
  letter-spacing: -0.03em;
}

.module-detail__copy > p {
  margin: 0;
  color: var(--asc-muted);
  font-size: 13px;
  line-height: 1.7;
}

.detail-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 25px;
}

.detail-list div {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--asc-border);
  border-radius: 7px;
  color: var(--asc-text);
  font-size: 11px;
}

.detail-list svg {
  color: var(--asc-success);
}

.module-diagram {
  position: relative;
  min-height: 390px;
  overflow: hidden;
  border: 1px solid var(--asc-border);
  border-radius: 10px;
  background: #f6fafd;
}

.diagram-node {
  position: absolute;
  min-width: 96px;
  padding: 10px 12px;
  border: 1px solid #a9cee3;
  border-radius: 7px;
  background: #fff;
  color: #245c7d;
  font-size: 10px;
  text-align: center;
  box-shadow: 0 8px 22px rgba(31, 74, 103, 0.08);
}

.diagram-node--center {
  top: 50%;
  left: 50%;
  z-index: 2;
  min-width: 140px;
  transform: translate(-50%, -50%);
  border-color: var(--asc-primary);
  background: var(--asc-primary);
  color: #fff;
  font-weight: 800;
}

.diagram-node--1 { top: 16%; left: 12%; }
.diagram-node--2 { top: 14%; right: 12%; }
.diagram-node--3 { bottom: 15%; left: 12%; }
.diagram-node--4 { right: 12%; bottom: 17%; }

.module-diagram--knowledge::before,
.module-diagram--knowledge::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 58%;
  height: 1px;
  content: "";
  background: #b9cfdd;
}

.module-diagram--knowledge::before {
  transform: translate(-50%, -50%) rotate(30deg);
}

.module-diagram--knowledge::after {
  transform: translate(-50%, -50%) rotate(-30deg);
}

.module-diagram--data {
  display: grid;
  align-content: center;
  gap: 16px;
  padding: 34px;
}

.data-row {
  display: grid;
  grid-template-columns: 105px minmax(80px, 1fr) 48px;
  align-items: center;
  gap: 12px;
  color: var(--asc-text);
  font-size: 10px;
}

.data-row > i {
  height: 7px;
  border-radius: 999px;
  background: #4aa0d0;
}

.data-row strong {
  color: var(--asc-muted);
  font-size: 9px;
}

.module-diagram--models {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 24px;
  padding: 34px;
}

.model-stack {
  display: flex;
  align-items: center;
  gap: 10px;
}

.model-stack span {
  padding: 13px 14px;
  border: 1px solid var(--asc-border);
  border-radius: 7px;
  background: #fff;
  color: var(--asc-muted);
  font-size: 10px;
}

.model-stack span.active {
  border-color: var(--asc-primary);
  background: var(--asc-primary);
  color: #fff;
  font-weight: 800;
}

.module-diagram--models p {
  max-width: 330px;
  margin: 0;
  color: var(--asc-muted);
  font-size: 10px;
  line-height: 1.6;
  text-align: center;
}

.module-page > footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--asc-border);
  border-radius: 7px;
  background: #fff;
  color: var(--asc-muted);
  font-size: 10px;
}

.module-page > footer strong {
  color: var(--asc-primary);
}

@media (max-width: 1050px) {
  .module-workspace {
    grid-template-columns: 230px minmax(0, 1fr);
  }

  .module-detail {
    grid-template-columns: 1fr;
    padding: 34px;
  }

  .module-diagram {
    min-height: 310px;
  }
}

@media (max-width: 760px) {
  .module-page {
    padding: 20px 12px;
  }

  .module-page > header {
    flex-direction: column;
  }

  .module-workspace {
    grid-template-columns: 1fr;
  }

  .module-workspace nav {
    display: flex;
    gap: 7px;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--asc-border);
  }

  .module-workspace nav button {
    min-width: 210px;
  }

  .module-workspace nav button + button {
    margin-top: 0;
  }

  .module-detail {
    gap: 26px;
    padding: 24px 16px;
  }

  .module-detail h2 {
    font-size: 26px;
  }

  .detail-list {
    grid-template-columns: 1fr;
  }
}
</style>
