-- ================================================
-- recipes_10000 전환 마이그레이션
-- 기존 recipes 기반 임베딩 구조를 recipes_10000 기준으로 교체
-- Supabase SQL Editor에서 순서대로 실행
-- ================================================

-- 1. 기존 임베딩 전체 삭제 (recipes 기반 데이터 초기화)
TRUNCATE TABLE recipe_embeddings;

-- 2. recipe_embeddings 테이블의 FK를 recipes_10000으로 교체
--    (기존 FK가 recipes(id)를 참조하고 있을 경우)
ALTER TABLE recipe_embeddings
  DROP CONSTRAINT IF EXISTS recipe_embeddings_recipe_id_fkey;

ALTER TABLE recipe_embeddings
  ADD CONSTRAINT recipe_embeddings_recipe_id_fkey
  FOREIGN KEY (recipe_id) REFERENCES recipes_10000(id) ON DELETE CASCADE;

-- 3. 기존 search_recipes_by_embedding 함수 교체
--    recipes_10000 컬럼 기준으로 재작성
DROP FUNCTION IF EXISTS search_recipes_by_embedding(vector, float, int);

CREATE OR REPLACE FUNCTION search_recipes_by_embedding(
  query_embedding  vector(1024),
  match_threshold  float   DEFAULT 0.3,
  match_count      int     DEFAULT 10
)
RETURNS TABLE (
  id                int,
  name              text,
  category          text,
  cooking_method    text,
  cooking_level     text,
  cook_time_minutes int,
  serving_size      text,
  ingredient_names  text[],
  ingredient_details jsonb,
  steps             jsonb,
  image_url         text,
  source_url        text,
  similarity        float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    r.id,
    r.name,
    r.category,
    r.cooking_method,
    r.cooking_level,
    r.cook_time_minutes,
    r.serving_size,
    r.ingredient_names,
    r.ingredient_details,
    r.steps,
    r.image_url,
    r.source_url,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM recipe_embeddings e
  JOIN recipes_10000 r ON r.id = e.recipe_id
  WHERE 1 - (e.embedding <=> query_embedding) >= match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;
