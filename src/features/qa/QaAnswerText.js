import { computed, defineComponent, h } from 'vue'

import { buildQaAnswerSegments } from './qaAnswerRenderingModel.js'

export default defineComponent({
  name: 'QaAnswerText',
  props: {
    text: {
      type: String,
      default: ''
    },
    references: {
      type: Array,
      default: () => []
    },
    domainTerms: {
      type: Array,
      default: () => []
    },
    citationIds: {
      type: Array,
      default: () => []
    }
  },
  emits: ['citation'],
  setup(props, { emit }) {
    const referenceMap = computed(() => new Map(
      props.references.map(reference => [String(reference?.id || '').toUpperCase(), reference])
    ))
    const segments = computed(() => {
      const rendered = buildQaAnswerSegments(props.text, {
        referenceIds: [...referenceMap.value.keys()],
        domainTerms: props.domainTerms
      })
      const renderedCitationIds = new Set(
        rendered.filter(segment => segment.type === 'citation').map(segment => segment.citationId)
      )
      const fallbackCitationIds = (props.citationIds || [])
        .map(id => String(id || '').toUpperCase())
        .filter(id => referenceMap.value.has(id) && !renderedCitationIds.has(id))

      return [
        ...rendered,
        ...fallbackCitationIds.map(citationId => ({
          type: 'citation',
          citationId,
          text: `[${citationId}]`
        }))
      ]
    })

    function renderSegment(segment, index) {
      if (segment.type === 'citation') {
        const reference = referenceMap.value.get(segment.citationId)
        const source = reference?.title || segment.citationId
        const excerpt = String(reference?.excerpt || '').replace(/\s+/g, ' ').trim()
        return h('button', {
          key: `citation-${segment.citationId}-${index}`,
          type: 'button',
          class: 'qa-inline-citation',
          title: `[${segment.citationId}] ${source}${excerpt ? `\n${excerpt.slice(0, 220)}` : ''}`,
          'aria-label': `查看引用 ${segment.citationId}`,
          onClick: () => emit('citation', segment.citationId)
        }, segment.text)
      }

      if (segment.type === 'domain') {
        const sourceLabel = segment.source === 'kg_entity'
          ? 'KG 实体'
          : segment.source === 'ontology_role'
            ? '本体角色'
            : '领域语义匹配'
        return h('strong', {
          key: `domain-${index}`,
          class: `qa-domain-term is-${segment.category}`,
          title: `${segment.categoryLabel || 'ASC 专业术语'} · ${sourceLabel}`
        }, [h('u', segment.text)])
      }

      if (segment.type === 'format') {
        const tag = segment.format === 'strong'
          ? 'strong'
          : segment.format === 'code'
            ? 'code'
            : 'em'
        return h(tag, {
          key: `format-${segment.format}-${index}`,
          class: `qa-answer-format qa-answer-format--${segment.format}`
        }, (segment.children || []).map((child, childIndex) => renderSegment(child, `${index}-${childIndex}`)))
      }

      return segment.text
    }

    return () => h('span', { class: 'qa-answer-rich-text' }, segments.value.map(renderSegment))
  }
})
