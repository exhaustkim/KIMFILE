export interface RecipeStep {
  step: number
  description: string
}

export interface IngredientDetail {
  name: string
  quantity: number | null
  unit: string | null
}

/** recipes_10000 테이블 스키마 */
export interface Recipe {
  id: number
  name: string
  cooking_method: string
  cooking_level: string           // 초보 | 중급 | 고급
  cook_time_minutes: number | null
  serving_size: string | null
  ingredients_raw: string | null
  ingredient_names: string[]
  ingredient_details: IngredientDetail[]
  steps: RecipeStep[]
  image_url: string | null
  source_url: string | null
  data_source: string | null
  created_at: string
}

export interface RecipeSearchResult
  extends Pick<Recipe,
    'id' | 'name' | 'cooking_method' | 'cooking_level' |
    'cook_time_minutes' | 'serving_size' | 'ingredient_names' |
    'ingredient_details' | 'steps' | 'image_url' | 'source_url'
  > {
  similarity: number
}
