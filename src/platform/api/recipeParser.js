import request from './request'

export function submitRecipe(data) {
  return request.post('/api/recipe-parser/submit', data)
}

export function registerTestData(recipeId, testResults) {
  return request.post('/api/admin/data/tp_test_properties', {
    tp_id: recipeId,
    test_condition: '',
    test_results: testResults,
    mr_ids: [],
  })
}

/** 调用后端 Python 解析器（返回 embedding + 解析结果） */
export function parseRecipeRemote(content) {
  return request
    .post('/api/recipe-parser/parse', { content })
    .then((res) => {
      if (res.code !== 200) {
        throw new Error(res.message || '后端解析失败')
      }
      return res.data
    })
}