import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAscDomainTerms,
  findAscDomainTermMatches
} from '../src/utils/ascDomainHighlighter.js'

test('collects professional concepts across ASC semantic categories', () => {
  const content = (
    '刚玉骨料与碳化硅采用CAC水泥结合，烧后形成莫来石相和SiO₂玻璃相；'
    + '骨料-基质界面过渡区(ITZ)的孔结构演化影响抗渣侵蚀性能与热震稳定性，'
    + '可用XRD物相分析和SEM-EDS面扫描验证。'
  )
  const terms = buildAscDomainTerms({ content })
  const byTerm = new Map(terms.map(item => [item.term, item.category]))

  assert.equal(byTerm.get('刚玉骨料'), 'raw_material')
  assert.equal(byTerm.get('CAC水泥结合'), 'binder_system')
  assert.equal(byTerm.get('莫来石相'), 'mineral_phase')
  assert.equal(byTerm.get('骨料-基质界面过渡区(ITZ)'), 'microstructure')
  assert.equal(byTerm.get('抗渣侵蚀性能'), 'performance_metric')
  assert.equal(byTerm.get('XRD物相分析'), 'characterization')
})

test('adds unseen terms dynamically from KG entity types and ontology roles', () => {
  const result = {
    verified_paths: [
      {
        candidate_path: {
          edges: [
            {
              source_node_name: '电熔致密刚玉颗粒',
              source_entity_type: 'RawMaterialAggregate',
              target_node_name: '临界热震裂纹密度',
              target_entity_type: 'PropertyMetric'
            }
          ]
        }
      }
    ],
    omd_plan: {
      semantic_roles: {
        binder_systems: ['硅溶胶复合结合体系'],
        characterization_methods: ['声发射损伤定位']
      }
    }
  }

  const terms = buildAscDomainTerms({ result })
  const byTerm = new Map(terms.map(item => [item.term, item]))

  assert.equal(byTerm.get('电熔致密刚玉颗粒').category, 'raw_material')
  assert.equal(byTerm.get('电熔致密刚玉颗粒').source, 'kg_entity')
  assert.equal(byTerm.get('临界热震裂纹密度').category, 'performance_metric')
  assert.equal(byTerm.get('硅溶胶复合结合体系').category, 'binder_system')
  assert.equal(byTerm.get('声发射损伤定位').category, 'characterization')
})

test('uses longest non-overlapping matches and protects ASCII boundaries', () => {
  const text = 'ASC 中 C 与 SiC 氧化形成 SiO₂玻璃相，SiO₂玻璃相随后封闭孔喉。'
  const terms = buildAscDomainTerms({ content: text })
  const matches = findAscDomainTermMatches(text, terms, { maxMatches: 10, maxPerSentence: 10 })
  const surfaces = matches.map(item => item.text)

  assert.ok(surfaces.includes('ASC'))
  assert.ok(surfaces.includes('C'))
  assert.ok(surfaces.includes('SiC'))
  assert.equal(surfaces.filter(value => value === 'C').length, 1)
  assert.equal(surfaces.filter(value => value === 'SiO₂玻璃相').length, 2)
  assert.ok(!surfaces.includes('SiO₂'))
})

test('limits annotation density per sentence', () => {
  const text = '刚玉骨料、碳化硅、石墨、硅微粉、莫来石相、尖晶石共同影响显气孔率。'
  const terms = buildAscDomainTerms({ content: text })
  const matches = findAscDomainTermMatches(text, terms, { maxMatches: 8, maxPerSentence: 3 })

  assert.equal(matches.length, 3)
})
