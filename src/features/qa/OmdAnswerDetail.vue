<template>
  <article class="omd-answer">
    <section v-if="model.lead" class="omd-answer__lead">
      <QaAnswerText
        :text="model.lead"
        :references="references"
        :domain-terms="domainTerms"
        @citation="$emit('citation', $event)"
      />
    </section>

    <section v-if="model.scaffold" class="omd-answer__scaffold">
      <strong>{{ model.scaffold.title }}</strong>
      <p v-if="model.scaffold.summary">
        <QaAnswerText
          :text="model.scaffold.summary"
          :references="references"
          :domain-terms="domainTerms"
          @citation="$emit('citation', $event)"
        />
      </p>
      <ol v-if="model.scaffold.items?.length">
        <li v-for="(item, index) in model.scaffold.items" :key="`${index}-${item}`">
          <QaAnswerText
            :text="item"
            :references="references"
            :domain-terms="domainTerms"
            @citation="$emit('citation', $event)"
          />
        </li>
      </ol>
    </section>

    <section v-if="model.tail" class="omd-answer__tail">
      <QaAnswerText
        :text="model.tail"
        :references="references"
        :domain-terms="domainTerms"
        @citation="$emit('citation', $event)"
      />
    </section>
  </article>
</template>

<script setup>
import QaAnswerText from './QaAnswerText.js'

defineProps({
  model: {
    type: Object,
    required: true
  },
  references: {
    type: Array,
    default: () => []
  },
  domainTerms: {
    type: Array,
    default: () => []
  }
})

defineEmits(['citation'])
</script>

<style scoped>
.omd-answer {
  display: grid;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #99f6e4;
  border-radius: 8px;
  background: #ecfdf5;
  color: #115e59;
  line-height: 1.8;
  white-space: normal;
}

.omd-answer__lead,
.omd-answer__tail {
  overflow-wrap: anywhere;
}

.omd-answer__tail {
  color: var(--asc-text);
}

.omd-answer__scaffold {
  padding: 12px 14px;
  border: 1px solid #5eead4;
  border-left: 4px solid #0f766e;
  border-radius: 8px;
  background: #f8fffd;
  color: #134e4a;
}

.omd-answer__scaffold > strong {
  color: #0f766e;
  font-weight: 900;
}

.omd-answer__scaffold p {
  margin: 5px 0 0;
}

.omd-answer__scaffold ol {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
  padding-left: 20px;
}

.omd-answer__scaffold li {
  padding-left: 2px;
  line-height: 1.65;
}
</style>
