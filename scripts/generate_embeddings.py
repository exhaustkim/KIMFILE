"""
냉장고 탐정 - BGE-M3 임베딩 생성 및 Supabase 업로드
"""

import time
import sys
from supabase import create_client, Client
from sentence_transformers import SentenceTransformer

# ─── 설정 ────────────────────────────────────────────────
SUPABASE_URL = "https://krkdimdbtegowmuumnrt.supabase.co"
SUPABASE_KEY = "sb_publishable_2l3cu7vD-m19rzpXZbYbGA_Y7qvznFe"
MODEL_NAME   = "BAAI/bge-m3"
BATCH_SIZE   = 32   # 인코딩 배치 크기
INSERT_BATCH = 50   # Supabase INSERT 배치 크기
# ─────────────────────────────────────────────────────────


def make_embed_text(recipe: dict) -> str:
    """
    임베딩에 사용할 텍스트 구성.
    레시피명 + 재료명 + 카테고리 + 조리방법을 합쳐
    의미 기반 검색이 가능하도록 한다.
    예: "깻잎볶음 깻잎 콩나물 대파 간장 반찬 볶기"
    """
    parts = [
        recipe.get("name", ""),
        " ".join(recipe.get("ingredient_names") or []),
        recipe.get("category", ""),
        recipe.get("cooking_method", ""),
    ]
    return " ".join(p for p in parts if p).strip()


def main():
    print("=" * 55)
    print("  BGE-M3 임베딩 생성 및 업로드")
    print("=" * 55)

    client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 1. 레시피 전체 로드
    print("\n[1/4] Supabase에서 레시피 로딩...")
    # Supabase 기본 limit 1000 우회 — 페이지네이션으로 전체 로드
    recipes = []
    page_size = 1000
    offset = 0
    while True:
        batch = (
            client.table("recipes")
            .select("id, name, category, cooking_method, ingredient_names")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
        )
        recipes.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    print(f"  → {len(recipes)}개 레시피 로드 완료")

    # 이미 임베딩된 recipe_id 조회 (재실행 시 중복 방지)
    existing = (
        client.table("recipe_embeddings")
        .select("recipe_id")
        .execute()
        .data
    )
    existing_ids = {row["recipe_id"] for row in existing}
    if existing_ids:
        recipes = [r for r in recipes if r["id"] not in existing_ids]
        print(f"  → 이미 처리된 {len(existing_ids)}개 제외, {len(recipes)}개 처리 예정")

    if not recipes:
        print("  → 모든 레시피가 이미 임베딩되어 있습니다.")
        return

    # 2. 모델 로딩
    print(f"\n[2/4] BGE-M3 모델 로딩...")
    start = time.time()
    model = SentenceTransformer(MODEL_NAME)
    print(f"  → 로딩 완료 ({time.time()-start:.1f}s)")

    # 3. 배치 인코딩
    print(f"\n[3/4] 임베딩 생성 중 (배치={BATCH_SIZE})...")
    texts = [make_embed_text(r) for r in recipes]

    all_embeddings = []
    total_batches = (len(texts) + BATCH_SIZE - 1) // BATCH_SIZE
    start = time.time()

    for i in range(0, len(texts), BATCH_SIZE):
        batch_texts = texts[i : i + BATCH_SIZE]
        batch_emb = model.encode(
            batch_texts,
            normalize_embeddings=True,   # 코사인 유사도용 정규화
            show_progress_bar=False,
        )
        all_embeddings.extend(batch_emb.tolist())

        batch_num = i // BATCH_SIZE + 1
        elapsed = time.time() - start
        eta = elapsed / batch_num * (total_batches - batch_num)
        print(
            f"  배치 {batch_num:3d}/{total_batches}  "
            f"({len(all_embeddings)}/{len(texts)}건)  "
            f"ETA {eta:.0f}s   ",
            end="\r",
        )

    print(f"\n  → 임베딩 생성 완료 ({time.time()-start:.1f}s)")

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
        batch = records[i : i + INSERT_BATCH]
        batch_num = i // INSERT_BATCH + 1
        try:
            res = client.table("recipe_embeddings").insert(batch).execute()
            total_inserted += len(res.data)
            print(f"  배치 {batch_num:3d}/{total_batches_insert} → {total_inserted}건 완료", end="\r")
        except Exception as e:
            print(f"\n  오류: 배치 {batch_num} — {e}")

    print(f"\n\n{'=' * 55}")
    print(f"  완료! {total_inserted}/{len(recipes)}건 임베딩 저장")
    print(f"{'=' * 55}\n")

    # 검색 테스트
    print("[검색 테스트] '달걀 감자로 만들 수 있는 반찬'")
    query_emb = model.encode("달걀 감자로 만들 수 있는 반찬", normalize_embeddings=True).tolist()
    results = client.rpc(
        "search_recipes_by_embedding",
        {"query_embedding": query_emb, "match_threshold": 0.5, "match_count": 5},
    ).execute().data

    for r in results:
        print(f"  [{r['similarity']:.3f}] {r['name']} ({r['category']} / {r['cooking_method']})")
        print(f"          재료: {', '.join((r['ingredient_names'] or [])[:5])}")


if __name__ == "__main__":
    main()
