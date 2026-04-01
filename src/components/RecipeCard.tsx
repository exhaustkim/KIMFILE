'use client'

import { useState } from 'react'
import type { Recipe } from '@/types/recipe'

const CATEGORY_COLOR: Record<string, string> = {
  '반찬': 'bg-green-50 text-green-700',
  '밥': 'bg-yellow-50 text-yellow-700',
  '국&찌개': 'bg-blue-50 text-blue-700',
  '일품': 'bg-purple-50 text-purple-700',
  '후식': 'bg-pink-50 text-pink-700',
  '기타': 'bg-gray-100 text-gray-600',
}

interface Props {
  recipe: Recipe
}

export default function RecipeCard({ recipe }: Props) {
  const [expanded, setExpanded] = useState(false)

  const categoryClass = CATEGORY_COLOR[recipe.category] ?? CATEGORY_COLOR['기타']

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* 카드 헤더 */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">{recipe.name}</h3>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${categoryClass}`}>
            {recipe.category}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span>🍳 {recipe.cooking_method}</span>
          <span>·</span>
          <span>{recipe.steps.length}단계</span>
        </div>

        {/* 재료 태그 */}
        <div className="flex flex-wrap gap-1">
          {(recipe.ingredient_names ?? []).slice(0, 6).map(name => (
            <span
              key={name}
              className="px-2 py-0.5 bg-gray-50 rounded-md text-xs text-gray-600 border border-gray-100"
            >
              {name}
            </span>
          ))}
          {(recipe.ingredient_names ?? []).length > 6 && (
            <span className="px-2 py-0.5 text-xs text-gray-400">
              +{recipe.ingredient_names.length - 6}
            </span>
          )}
        </div>
      </div>

      {/* 조리 단계 (접기/펼치기) */}
      <div className="border-t border-gray-50">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <span>조리 순서 보기</span>
          <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </button>

        {expanded && (
          <ol className="px-4 pb-4 space-y-2">
            {recipe.steps.map(step => (
              <li key={step.step} className="flex gap-2.5 text-xs text-gray-700">
                <span className="shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-semibold text-[10px]">
                  {step.step}
                </span>
                <span className="leading-relaxed pt-0.5">{step.description}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
