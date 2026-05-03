# Todo

## 진행 중 / 완료

### recipes_10000 전환 (2025-05-03)
- [x] SQL: `recipe_embeddings` FK → `recipes_10000` 교체
- [x] SQL: `search_recipes_by_embedding` RPC → `recipes_10000` 기준으로 재작성
- [x] `generate_embeddings.py`: `recipes` → `recipes_10000`, `steps` 포함으로 임베딩 품질 개선
- [x] `src/types/recipe.ts`: `recipes_10000` 스키마에 맞게 갱신
- [x] `api/recipes/search/route.ts`: `recipes_10000` 기반으로 전환
- [x] `api/chat/route.ts`: 재고 연동 (보유 재료 기반 추천) 추가
- [x] `api/ocr/receipt/route.ts`: 구매일 OCR 추출 추가
- [x] `receipt/page.tsx`: 구매일 확인·편집 UI 추가
- [x] `recipes_10000` CSV 백업 (`export_recipes.py`)
- [x] `CLAUDE.md` + `tasks/` 설정

## 남은 작업

- [ ] `generate_embeddings.py` 실행 — 임베딩 생성 (Cohere API 키 필요)
- [ ] 변경사항 커밋 · 푸시 (GitHub → Vercel 자동 배포)
- [ ] 팀원에게 `search_recipes_by_embedding` RPC `category` 제거 공유
