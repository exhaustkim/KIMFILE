'use client'

import { useState } from 'react'
import RecipeCard from './RecipeCard'
import type { Recipe } from '@/types/recipe'

const CATEGORIES = ['반찬', '밥', '국&찌개', '일품', '후식', '기타']

export default function RecipeSearch() {
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [results, setResults] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (!query.trim() && !selectedCategory) return

    setLoading(true)
    setSearched(true)

    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (selectedCategory) params.set('category', selectedCategory)
    params.set('limit', '12')

    const res = await fetch(`/api/recipes/search?${params}`)
    const data = await res.json()
    setResults(data.results ?? [])
    setLoading(false)
  }

  function handleCategoryClick(cat: string) {
    const next = selectedCategory === cat ? '' : cat
    setSelectedCategory(next)
    // 카테고리 클릭 시 바로 검색
    setLoading(true)
    setSearched(true)
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (next) params.set('category', next)
    params.set('limit', '12')
    fetch(`/api/recipes/search?${params}`)
      .then(r => r.json())
      .then(data => {
        setResults(data.results ?? [])
        setLoading(false)
      })
  }

  return (
    <div className="space-y-6">
      {/* 검색 바 */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="재료를 입력하세요 (예: 달걀, 감자, 대파)"
          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-3 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          검색
        </button>
      </form>

      {/* 카테고리 필터 */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => handleCategoryClick(cat)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-600'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 결과 */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm">검색 결과가 없습니다. 다른 재료로 시도해 보세요.</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <p className="text-sm text-gray-500">{results.length}개의 레시피를 찾았습니다</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map(recipe => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        </>
      )}

      {!searched && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-4">🕵️</p>
          <p className="text-sm">냉장고 속 재료를 입력하면<br />만들 수 있는 레시피를 찾아드립니다</p>
        </div>
      )}
    </div>
  )
}
