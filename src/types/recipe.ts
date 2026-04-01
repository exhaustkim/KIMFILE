export interface RecipeStep {
  step: number
  description: string
}

export interface Recipe {
  id: number
  rcp_seq: number
  name: string
  category: string
  cooking_method: string
  ingredients_raw: string | null
  ingredient_names: string[]
  steps: RecipeStep[]
  hash_tags: string[]
  created_at: string
}

export interface RecipeSearchResult extends Pick<Recipe, 'id' | 'name' | 'category' | 'cooking_method' | 'ingredient_names' | 'steps'> {
  similarity: number
}
