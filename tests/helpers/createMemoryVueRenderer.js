import { createRenderer } from 'vue'

function detach(node) {
  const siblings = node?.parent?.children
  if (!siblings) return
  const index = siblings.indexOf(node)
  if (index >= 0) siblings.splice(index, 1)
}

export function createMemoryVueRenderer() {
  const document = { activeElement: null }

  function descendants(node) {
    return (node?.children || []).flatMap(child => [child, ...descendants(child)])
  }

  function createNode(type) {
    const node = {
      type,
      children: [],
      parent: null,
      props: {},
      text: '',
      ownerDocument: document,
      addEventListener() {},
      removeEventListener() {},
      focus() { document.activeElement = node },
      contains(candidate) {
        return candidate === node || descendants(node).includes(candidate)
      },
      querySelectorAll() {
        return descendants(node).filter(candidate => (
          ['a', 'button', 'input', 'select', 'textarea'].includes(candidate.type)
          && candidate.props?.disabled !== true
          && candidate.props?.tabindex !== '-1'
        ))
      }
    }
    return node
  }

  const root = createNode('root')
  const renderer = createRenderer({
    patchProp(node, key, previous, next) { node.props[key] = next },
    insert(child, parent, anchor = null) {
      detach(child)
      child.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      if (index >= 0) parent.children.splice(index, 0, child)
      else parent.children.push(child)
    },
    remove(node) { detach(node); node.parent = null },
    createElement(type) { return createNode(type) },
    createText(text) { const node = createNode('#text'); node.text = text; return node },
    createComment(text) { const node = createNode('#comment'); node.text = text; return node },
    setText(node, text) { node.text = text },
    setElementText(node, text) { node.children = []; node.text = text },
    parentNode(node) { return node.parent },
    nextSibling(node) {
      const siblings = node?.parent?.children || []
      return siblings[siblings.indexOf(node) + 1] || null
    },
    querySelector() { return null },
    setScopeId() {},
    cloneNode(node) { return { ...node, children: [], parent: null, props: { ...node.props } } },
    insertStaticContent(content, parent, anchor) {
      const node = { type: '#static', children: [], parent: null, props: {}, text: content }
      node.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      if (index >= 0) parent.children.splice(index, 0, node)
      else parent.children.push(node)
      return [node, node]
    }
  })
  return { renderer, root, document }
}

export function renderedText(node) {
  return `${node?.text || ''}${(node?.children || []).map(renderedText).join('')}`
}
