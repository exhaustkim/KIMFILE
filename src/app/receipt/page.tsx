'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Ingredient {
  text: string
  confidence: number
  selected: boolean
  expiry_date: string
  storage_location: '냉장' | '냉동' | '실온'
}

export default function ReceiptPage() {
  const router = useRouter()
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [purchaseDate, setPurchaseDate] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const file = (window as Window & { __receiptFile?: File }).__receiptFile
    if (!file) {
      router.push('/home')
      return
    }
    runOCR(file)
  }, [router])

  async function runOCR(file: File) {
    setLoading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/ocr/receipt', { method: 'POST', body: form })
      if (!res.ok) throw new Error('OCR 처리 실패')
      const data = await res.json()
      const today = new Date()
      today.setDate(today.getDate() + 7)
      const defaultExpiry = today.toISOString().split('T')[0]

      // OCR에서 추출된 구매일 세팅 (없으면 오늘)
      setPurchaseDate(data.purchase_date ?? new Date().toISOString().split('T')[0])

      setIngredients(
        (data.ingredients ?? []).map((i: { text: string; confidence: number }) => ({
          text: i.text,
          confidence: i.confidence,
          selected: true,
          expiry_date: defaultExpiry,
          storage_location: '냉장' as const,
        }))
      )
    } catch {
      setError('OCR 처리 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  function toggle(idx: number) {
    setIngredients(prev => prev.map((i, n) => n === idx ? { ...i, selected: !i.selected } : i))
  }

  function updateField(idx: number, field: 'expiry_date' | 'storage_location', value: string) {
    setIngredients(prev => prev.map((i, n) => n === idx ? { ...i, [field]: value } : i))
  }

  async function handleSave() {
    const selected = ingredients.filter(i => i.selected)
    if (selected.length === 0) {
      setError('저장할 재료를 선택해주세요')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/inventory/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selected.map(i => ({
            ingredient_name: i.text,
            purchase_date: purchaseDate || null,
            expiry_date: i.expiry_date,
            storage_location: i.storage_location,
            added_by: 'ocr',
            expiry_source: 'user',
          })),
        }),
      })
      if (!res.ok) throw new Error('저장 실패')
      router.push('/chat')
    } catch {
      setError('저장 중 오류가 발생했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/home')} className="text-gray-400 hover:text-gray-600">
            ← 뒤로
          </button>
          <h1 className="font-bold text-gray-900">식재료 확인</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6">
        {loading && (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-gray-500">영수증 분석 중...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {!loading && ingredients.length === 0 && !error && (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🤔</div>
            <p className="text-gray-500">식재료를 찾지 못했습니다</p>
            <button
              onClick={() => router.push('/home')}
              className="mt-4 text-sm text-orange-500 underline"
            >
              다시 시도
            </button>
          </div>
        )}

        {!loading && ingredients.length > 0 && (
          <>
            {/* 구매일 확인 */}
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4 flex items-center gap-3">
              <span className="text-xl">🗓️</span>
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1">구매일</p>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={e => setPurchaseDate(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <p className="text-xs text-gray-400">영수증에서 자동 인식</p>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              인식된 식재료 {ingredients.length}개 · 체크 해제하면 저장에서 제외됩니다
            </p>

            <div className="space-y-3 mb-24">
              {ingredients.map((item, idx) => (
                <div
                  key={idx}
                  className={`bg-white rounded-xl border p-4 transition-colors ${
                    item.selected ? 'border-orange-200' : 'border-gray-100 opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggle(idx)}
                      className="w-5 h-5 accent-orange-500"
                    />
                    <span className="font-medium text-gray-900">{item.text}</span>
                    <span className="ml-auto text-xs text-gray-400">
                      {Math.round(item.confidence * 100)}%
                    </span>
                  </div>

                  {item.selected && (
                    <div className="grid grid-cols-2 gap-2 ml-8">
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">소비기한</label>
                        <input
                          type="date"
                          value={item.expiry_date}
                          onChange={e => updateField(idx, 'expiry_date', e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">보관 위치</label>
                        <select
                          value={item.storage_location}
                          onChange={e => updateField(idx, 'storage_location', e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400"
                        >
                          <option value="냉장">냉장</option>
                          <option value="냉동">냉동</option>
                          <option value="실온">실온</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 하단 고정 저장 버튼 */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4">
              <div className="max-w-lg mx-auto">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold rounded-xl transition-colors"
                >
                  {saving ? '저장 중...' : `${ingredients.filter(i => i.selected).length}개 재고에 추가`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
