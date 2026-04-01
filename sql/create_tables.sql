-- ================================================
-- 냉장고 탐정 - 레시피 테이블 스키마 (베타)
-- Supabase SQL Editor에서 실행
-- ================================================

-- 레시피 테이블
CREATE TABLE IF NOT EXISTS recipes (
  id                SERIAL PRIMARY KEY,
  rcp_seq           INTEGER UNIQUE NOT NULL,   -- 식품안전나라 원본 ID
  name              TEXT NOT NULL,              -- 레시피명 (RCP_NM)
  category          TEXT NOT NULL,              -- 요리 분류 (RCP_PAT2): 반찬/밥/국&찌개/일품/후식/기타
  cooking_method    TEXT NOT NULL,              -- 조리방법 (RCP_WAY2): 볶기/끓이기/굽기/찌기/튀기기/기타
  ingredients_raw   TEXT,                       -- 재료 원문 (RCP_PARTS_DTLS)
  ingredient_names  TEXT[],                     -- 파싱된 재료명 배열 (검색용)
  steps             JSONB,                      -- 조리단계 [{step, description}]
  hash_tags         TEXT[],                     -- 해시태그 배열 (HASH_TAG)
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 검색 인덱스
CREATE INDEX IF NOT EXISTS idx_recipes_category
  ON recipes(category);

CREATE INDEX IF NOT EXISTS idx_recipes_cooking_method
  ON recipes(cooking_method);

CREATE INDEX IF NOT EXISTS idx_recipes_ingredient_names
  ON recipes USING GIN(ingredient_names);

CREATE INDEX IF NOT EXISTS idx_recipes_hash_tags
  ON recipes USING GIN(hash_tags);
