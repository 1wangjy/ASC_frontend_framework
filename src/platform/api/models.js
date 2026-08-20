import request from './request'
import { unwrapApiResult } from './request'

export function submitModel1(data) {
  return request.post('/api/model1/submit', data).then(unwrapApiResult)
}

export function submitModel2(data) {
  return request.post('/api/model2/submit', data).then(unwrapApiResult)
}

export function submitModel3(data) {
  return request.post('/api/model3/submit', data).then(unwrapApiResult)
}

export function reconstructModel4(data) {
  return request.post('/api/model4/reconstruct', data)
}

export function generateStatic() {
  return request.get('/api/model4/generate-static')
    .then(res => unwrapApiResult(res).data)
}

export function generateAnimation() {
  return request.get('/api/model4/generate-animation')
    .then(res => unwrapApiResult(res).frames)
}