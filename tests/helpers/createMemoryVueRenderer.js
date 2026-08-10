import { createRenderer } from 'vue'

function detach(node) {
  const siblings = node?.parent?.children
  if (!siblings) return
  const index = siblings.indexOf(node)
  if (index >= 0) siblings.splice(index, 1)
}

export function createMemoryVueRenderer() {
  const root = { type: 'root', children: [], parent: null, props: {}, text: '' }
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
    createElement(type) { return { type, children: [], parent: null, props: {}, text: '' } },
    createText(text) { return { type: '#text', children: [], parent: null, props: {}, text } },
    createComment(text) { return { type: '#comment', children: [], parent: null, props: {}, text } },
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
  return { renderer, root }
}

export function renderedText(node) {
  return `${node?.text || ''}${(node?.children || []).map(renderedText).join('')}`
}
