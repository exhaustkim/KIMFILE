import RecipeSearch from '@/components/RecipeSearch'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()

  const { data: stats } = await supabase
    .from('recipes')
    .select('category')

  const categoryCounts = (stats ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-center gap-3">
          <span className="text-3xl">🕵️</span>
          <div>
            <h1 className="text-xl font-bold text-gray-900">냉장고 탐정</h1>
            <p className="text-sm text-gray-500">재료로 레시피를 찾아드립니다</p>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-wrap gap-2">
          {Object.entries(categoryCounts).map(([cat, count]) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-orange-700 text-sm font-medium"
            >
              {cat}
              <span className="text-orange-400 font-normal">{count}</span>
            </span>
          ))}
        </div>

        <RecipeSearch />
      </div>
    </main>
  )
}
