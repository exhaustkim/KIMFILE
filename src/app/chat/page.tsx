'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type UserLevel = 'beginner' | 'intermediate' | 'advanced'
type Role = 'user' | 'assistant'

interface Message {
  role: Role
  content: string
  source?: 'db' | 'youtube'
}

const LEVEL_OPTIONS: { value: UserLevel; label: string; desc: string }[] = [
  { value: 'beginner',     label: '초보',  desc: '간단한 재료·도구로' },
  { value: 'intermediate', label: '중급',  desc: '일반적인 수준으로' },
  { value: 'advanced',     label: '고급',  desc: '상세한 기법까지' },
]

export default function ChatPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '안녕하세요! 냉장고에 있는 재료로 무엇을 만들어 드릴까요? 재료를 알려주시면 레시피를 찾아드립니다 🍳' },
  ])
  const [input, setInput] = useState('')
  const [level, setLevel] = useState<UserLevel>('beginner')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    // Gemini history 포맷 (assistant → model)
    const history = messages
      .slice(1) // 첫 인사 메시지 제외
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        content: m.content,
      }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, user_level: level, history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply,
        source: data.source,
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '죄송합니다, 오류가 발생했습니다. 다시 시도해주세요.',
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-col h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push('/home')} className="text-gray-400 hover:text-gray-600 text-sm">
          ←
        </button>
        <span className="text-xl">🕵️</span>
        <span className="font-bold text-gray-900">냉장고 탐정</span>

        {/* 수준 선택 */}
        <div className="ml-auto flex gap-1">
          {LEVEL_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setLevel(opt.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                level === opt.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap break-words ${
                msg.role === 'user'
                  ? 'bg-orange-500 text-white rounded-br-sm'
                  : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
              }`}
            >
              {msg.content}
              {msg.source === 'youtube' && (
                <p className="mt-1 text-xs text-gray-400">📺 YouTube 검색 결과 기반</p>
              )}
              {msg.source === 'db' && (
                <p className="mt-1 text-xs text-orange-300">📖 레시피 DB 기반</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-4">
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 shrink-0">
        <form onSubmit={sendMessage} className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="재료나 요리를 입력하세요..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:bg-gray-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white rounded-xl text-sm font-medium transition-colors"
          >
            전송
          </button>
        </form>
      </div>
    </main>
  )
}
