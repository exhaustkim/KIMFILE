# 냉장고 탐정 — 프로젝트 가이드

## 프로젝트 개요
- 1인 가구 대상 냉장고 재고 관리 + 레시피 추천 서비스
- Stack: Next.js 15 / Supabase (PostgreSQL + pgvector) / Cohere / Gemini
- 레시피 데이터: `recipes_10000` 테이블 (만개의레시피 크롤링)
- 역할 분리: DB 관리(Supabase) / 코드(팀원) — Supabase 변경은 즉시 전체 공유됨

---

## 프로젝트 주의사항
- Supabase 변경(SQL 실행)은 즉시 전체 팀에 적용됨 — 팀원 코드 영향 사전 확인 필수
- `recipes_10000`에는 `category` 컬럼 없음
- `recipe_embeddings.recipe_id`는 `recipes_10000(id)` 참조
