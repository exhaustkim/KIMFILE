"""
냉장고 탐정 - Cohere 임베딩 생성 및 Supabase 업로드
모델: embed-multilingual-v3.0 (1024차원, 한국어 지원)
대상 테이블: recipes_10000
"""

import os
import time
import cohere
from supabase import create_client, Client

# ─── 설정 ────────────────────────────────────────────────
SUPABASE_URL   = os.environ.get("NEXT_PUBLIC_SUPABASE_URL",  "https://krkdimdbtegowmuumnrt.supabase.co")
SUPABASE_KEY   = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_2l3cu7vD-m19rzpXZbYbGA_Y7qvznFe")
COHERE_API_KEY = os.environ.get("COHERE_API_KEY", "")
MODEL_NAME     = "embed-multilingual-v3.0"
EMBED_BATCH    = 96   # Cohere 배치 최대 96
INSERT_BATCH   = 50   # Supabase INSERT 배치
# ─────────────────────────────────────────────────────────


def make_embed_text(recipe: dict) -> str:
    steps = recipe.get("steps") or []
    step_text = " ".join(
        s.get("description", "") for s in steps if isinstance(s, dict)
    )
    parts = [
        recipe.get("name", ""),
        " ".join(recipe.get("ingredient_names") or []),
        recipe.get("cooking_method", ""),
        recipe.get("cooking_level", ""),
        step_text,
    ]
    return " ".join(p for p in parts if p).strip()


def main():
    print("=" * 55)
    print("  Cohere 임베딩 생성 및 업로드")
    print("=" * 55)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    co = cohere.Client(COHERE_API_KEY)

    # 1. 기존 임베딩 전체 삭제
    print("\n[1/4] 기존 임베딩 삭제 중...")
    supabase.table("recipe_embeddings").delete().neq("id", 0).execute()
    print("  → 삭제 완료")

    # 2. recipes_10000 전체 로드
    print("\n[2/4] Supabase에서 레시피 로딩 (recipes_10000)...")
    recipes = []
    page_size = 1000
    offset = 0
    while True:
        batch = (
            supabase.table("recipes_10000")
            .select("id, name, cooking_method, cooking_level, ingredient_names, steps")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        recipes.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    print(f"  → {len(recipes)}개 레시피 로드 완료")

    # 3. Cohere 임베딩 생성
    print(f"\n[3/4] Cohere 임베딩 생성 중 (배치={EMBED_BATCH})...")
    texts = [make_embed_text(r) for r in recipes]
    all_embeddings = []
    total_batches = (len(texts) + EMBED_BATCH - 1) // EMBED_BATCH
    start = time.time()

    for i in range(0, len(texts), EMBED_BATCH):
        batch_texts = texts[i: i + EMBED_BATCH]
        resp = co.embed(
            texts=batch_texts,
            model=MODEL_NAME,
            input_type="search_document",  # 문서 인덱싱용
        )
        all_embeddings.extend(resp.embeddings)

        batch_num = i // EMBED_BATCH + 1
        elapsed = time.time() - start
        eta = elapsed / batch_num * (total_batches - batch_num)
        print(
            f"  배치 {batch_num:3d}/{total_batches}  "
            f"({len(all_embeddings)}/{len(texts)}건)  "
            f"ETA {eta:.0f}s   ",
            end="\r",
        )
        time.sleep(0.1)  # API rate limit 여유

    print(f"\n  → 임베딩 생성 완료 ({time.time()-start:.1f}s)")
    print(f"  → 임베딩 차원: {len(all_embeddings[0])}")

    # 4. Supabase 업로드
    print(f"\n[4/4] Supabase 업로드 중 (배치={INSERT_BATCH})...")
    records = [
        {
            "recipe_id":  recipes[i]["id"],
            "embedding":  all_embeddings[i],
            "embed_text": texts[i],
        }
        for i in range(len(recipes))
    ]

    total_inserted = 0
    total_batches_insert = (len(records) + INSERT_BATCH - 1) // INSERT_BATCH

    for i in range(0, len(records), INSERT_BATCH):
        batch = records[i: i + INSERT_BATCH]
        batch_num = i // INSERT_BATCH + 1
        try:
            res = supabase.table("recipe_embeddings").insert(batch).execute()
            total_inserted += len(res.data)
            print(f"  배치 {batch_num:3d}/{total_batches_insert} → {total_inserted}건 완료", end="\r")
        except Exception as e:
            print(f"\n  오류: 배치 {batch_num} — {e}")

    print(f"\n\n{'=' * 55}")
    print(f"  완료! {total_inserted}/{len(recipes)}건 임베딩 저장")
    print(f"{'=' * 55}\n")

    # 검색 테스트
    print("[검색 테스트] '달걀 감자로 만들 수 있는 반찬'")
    query_resp = co.embed(
        texts=["달걀 감자로 만들 수 있는 반찬"],
        model=MODEL_NAME,
        input_type="search_query",  # 쿼리용
    )
    query_emb = query_resp.embeddings[0]

    results = supabase.rpc(
        "search_recipes_by_embedding",
        {"query_embedding": query_emb, "match_threshold": 0.3, "match_count": 5},
    ).execute().data

    for r in results:
        level     = r.get("cooking_level", "")
        cook_time = r.get("cook_time_minutes", "")
        print(f"  [{r['similarity']:.3f}] {r['name']} ({r['cooking_method']} / {level} / {cook_time}분)")
        print(f"          재료: {', '.join((r['ingredient_names'] or [])[:5])}")


if __name__ == "__main__":
    main()
