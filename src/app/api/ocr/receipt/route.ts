import { NextRequest, NextResponse } from 'next/server'

const OCR_SERVER_URL = process.env.OCR_SERVER_URL ?? 'http://localhost:8000'

// POST /api/ocr/receipt
// 스마트폰 카메라로 찍은 영수증 이미지 → 식재료 후보 반환
// Content-Type: multipart/form-data (field name: "file")
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'multipart/form-data 형식으로 전송해 주세요' },
      { status: 400 }
    )
  }

  // 이미지를 그대로 OCR 서버로 전달 (프록시)
  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'file 필드가 없습니다' }, { status: 400 })
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: '이미지는 10MB 이하여야 합니다' }, { status: 413 })
  }

  // OCR 서버로 포워딩
  const upstream = new FormData()
  upstream.append('file', file)

  let ocrRes: Response
  try {
    ocrRes = await fetch(`${OCR_SERVER_URL}/ocr/receipt`, {
      method: 'POST',
      body: upstream,
      signal: AbortSignal.timeout(30_000),  // 30초 타임아웃
    })
  } catch (err) {
    console.error('[OCR] 서버 연결 실패:', err)
    return NextResponse.json(
      { error: 'OCR 서버에 연결할 수 없습니다' },
      { status: 502 }
    )
  }

  if (!ocrRes.ok) {
    const detail = await ocrRes.json().catch(() => ({ detail: 'OCR 처리 실패' }))
    return NextResponse.json({ error: detail.detail }, { status: ocrRes.status })
  }

  const result = await ocrRes.json()

  // 응답 구조:
  // {
  //   raw_texts: string[],
  //   ingredients: [{ text: string, confidence: number }],
  //   image_size: [width, height]
  // }
  return NextResponse.json(result)
}
