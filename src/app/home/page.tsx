'use client'

import { useRouter } from 'next/navigation'
import { useRef } from 'react'

export default function HomePage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    sessionStorage.setItem('receiptFile', url)
    sessionStorage.setItem('receiptFileName', file.name)
    // 파일 객체를 전달하기 위해 form data 저장
    const dt = new DataTransfer()
    dt.items.add(file)
    ;(window as Window & { __receiptFile?: File }).__receiptFile = file
    router.push('/receipt')
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🕵️</span>
            <span className="font-bold text-gray-900">냉장고 탐정</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            로그아웃
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-10 space-y-4">
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-gray-900">영수증 스캔</h2>
          <p className="mt-1 text-sm text-gray-500">영수증을 촬영하거나 선택하면<br />식재료를 자동으로 불러옵니다</p>
        </div>

        {/* 카메라 촬영 */}
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-2xl p-6 flex items-center gap-4 transition-colors"
        >
          <span className="text-4xl">📷</span>
          <div className="text-left">
            <p className="font-semibold text-lg">카메라로 촬영</p>
            <p className="text-sm text-orange-100 mt-0.5">영수증을 바로 찍어서 스캔</p>
          </div>
        </button>

        {/* 파일 선택 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full bg-white hover:bg-gray-50 active:bg-gray-100 border border-gray-200 text-gray-900 rounded-2xl p-6 flex items-center gap-4 transition-colors"
        >
          <span className="text-4xl">🖼️</span>
          <div className="text-left">
            <p className="font-semibold text-lg">갤러리에서 선택</p>
            <p className="text-sm text-gray-400 mt-0.5">저장된 영수증 사진 불러오기</p>
          </div>
        </button>

        {/* hidden inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </main>
  )
}
