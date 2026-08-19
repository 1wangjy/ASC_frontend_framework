const mongoose = require('mongoose');

let models = null;

function initModels() {
  if (models) {
    return models;
  }

  // 原料模型
  const materialSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String }
  });

  // 配方模型
  const recipeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    content: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
  });

  // 测试指标模型
  const testMetricSchema = new mongoose.Schema({
    recipe_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe' },
    value: { type: Number, required: true },
    type: { type: String, required: true }
  });

  // 工况指标模型
  const workingConditionSchema = new mongoose.Schema({
    temperature: { type: Number },
    pressure: { type: Number },
    time: { type: Number },
    created_at: { type: Date, default: Date.now }
  });

  // 向量存储模型
  const embeddingSchema = new mongoose.Schema({
    type: { type: String, required: true },
    source_id: { type: mongoose.Schema.Types.ObjectId },
    vector: { type: [Number], required: true },
    created_at: { type: Date, default: Date.now }
  });

  // 导出模型
  const Material = mongoose.model('Material', materialSchema);
  const Recipe = mongoose.model('Recipe', recipeSchema);
  const TestMetric = mongoose.model('TestMetric', testMetricSchema);
  const WorkingCondition = mongoose.model('WorkingCondition', workingConditionSchema);
  const Embedding = mongoose.model('Embedding', embeddingSchema);

  models = {
    Material,
    Recipe,
    TestMetric,
    WorkingCondition,
    Embedding
  };

  return models;
}

module.exports = {
  initModels,
  get Material() { return initModels().Material; },
  get Recipe() { return initModels().Recipe; },
  get TestMetric() { return initModels().TestMetric; },
  get WorkingCondition() { return initModels().WorkingCondition; },
  get Embedding() { return initModels().Embedding; }
};
