/**
 * Model API request/response type definitions.
 */

/** @typedef {{ content: string }} Model1SubmitRequest */
/** @typedef {{ recipeId?: string|number, vector?: number[], modelResult?: {status?: string, message?: string, prediction?: string|number, confidence?: string|number}, prediction?: string|number, confidence?: string|number }} Model1SubmitResponse */

/** @typedef {{ metrics: { value: number, type: 'strength'|'hardness'|'elasticity'|'conductivity' }, loadEmbedding: boolean }} Model2SubmitRequest */
/** @typedef {{ ingredients: string[], proportions: number[], score: number }} OptimizedRecipe */
/** @typedef {{ metricId: string, loadEmbedding: boolean, modelResult?: { status?: string, message?: string, optimizedRecipe?: OptimizedRecipe } }} Model2SubmitResponse */

/** @typedef {{ temperature: number, pressure: number, time: number }} Model3SubmitRequest */
/** @typedef {{ conditionId: string, embedding?: number[], environmentScore?: number, modelResult?: { status?: string, message?: string } }} Model3SubmitResponse */

/** @typedef {{ stlContent: number[], tempPoints: TempPoint[] }} Model4ReconstructRequest */
/** @typedef {{ vertices: number[][], faces: number[][] }} AnimationFrame */
/** @typedef {{ vertices: number[][], faces: number[][] }} StaticGutterData */
/** @typedef {{ x: number, y: number, z: number, temperature: number }} TempPoint */

/** @typedef {{ name: string, type: string, batch: string, components: Array, testData: Object }} RecipeSubmitData */
/** @typedef {{ index: number, original: string, type: string, componentName: string, materialId: string, materialName: string, percentage: number, properties: Object, matchedMaterial: Object|null, type_valid: boolean, id_valid: boolean, properties_valid: boolean, componentType: string }} RecipeTableRow */
/** @typedef {{ components: RecipeTableRow[], testData: Object, warnings: string[], embedding?: number[][], embeddingShape?: number[] }} RecipeParseResult */

export default {}