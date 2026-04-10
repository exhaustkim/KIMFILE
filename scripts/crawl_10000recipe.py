"""
만개의레시피 크롤러
- 초급 + 30분 이내 레시피만 수집
- JSON-LD 기반 파싱 (안정적)
- Supabase recipes_10000 테이블에 저장
"""

import os
import re
import json
import time
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client

# ─── 설정 ────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://krkdimdbtegowmuumnrt.supabase.co")
SUPABASE_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_KEY", "")  # service_role 키 사용
BASE_URL     = "https://www.10000recipe.com"
LIST_URL     = BASE_URL + "/recipe/list.html"
INSERT_BATCH = 20
SLEEP_SEC    = 0.5   # 서버 부하 방지

# 필터 기준
MAX_INGREDIENTS = 8
MAX_STEPS       = 6
# ─────────────────────────────────────────────────────────


def get_recipe_ids(pages: int = 30) -> list[str]:
    """초급 + 30분 이내 필터로 레시피 ID 목록 수집"""
    ids = []
    params = {
        "degree": "1",   # 초급
        "time":   "30",  # 30분 이내
        "order":  "reco",
        "limit":  "60",
    }
    print(f"[1/3] 레시피 ID 수집 중 (최대 {pages}페이지)...")

    for page in range(1, pages + 1):
        params["page"] = str(page)
        try:
            res = requests.get(LIST_URL, params=params, timeout=10,
                               headers={"User-Agent": "Mozilla/5.0"})
            soup = BeautifulSoup(res.text, "html.parser")

            # /recipe/{id} 패턴 링크 추출
            links = soup.select("a[href^='/recipe/']")
            page_ids = []
            for a in links:
                href = a.get("href", "")
                match = re.match(r"^/recipe/(\d+)$", href)
                if match:
                    page_ids.append(match.group(1))

            page_ids = list(dict.fromkeys(page_ids))  # 중복 제거
            if not page_ids:
                print(f"  → {page}페이지 ID 없음, 종료")
                break

            ids.extend(page_ids)
            print(f"  페이지 {page:3d}/{pages}  누적 {len(ids)}개", end="\r")
            time.sleep(SLEEP_SEC)

        except Exception as e:
            print(f"\n  오류 (페이지 {page}): {e}")

    ids = list(dict.fromkeys(ids))  # 전체 중복 제거
    print(f"\n  → 총 {len(ids)}개 ID 수집 완료")
    return ids


def parse_time(iso_time: str) -> int | None:
    """PT30M → 30 변환"""
    if not iso_time:
        return None
    match = re.search(r"(\d+)M", iso_time)
    return int(match.group(1)) if match else None


def parse_ingredient(text: str) -> dict:
    """
    '토마토 3개' → {"name": "토마토", "quantity": 3, "unit": "개"}
    '소금 조금'  → {"name": "소금",  "quantity": None, "unit": "조금"}
    """
    text = text.strip()
    # 숫자+단위 패턴
    match = re.search(
        r"(\d+(?:[./]\d+)?)\s*(개|g|kg|ml|L|컵|큰술|작은술|뿌리|단|조각|장|마리|쪽|줄기|포기|봉지|캔|병|통|팩|모|줌|꼬집)",
        text
    )
    if match:
        raw_qty = match.group(1)
        unit    = match.group(2)
        # 분수 처리 (1/2 → 0.5)
        if "/" in raw_qty:
            num, den = raw_qty.split("/")
            quantity = round(float(num) / float(den), 2)
        else:
            quantity = float(raw_qty)
        name = text[:match.start()].strip()
        return {"name": name or text, "quantity": quantity, "unit": unit}
    else:
        # 수량 파싱 불가 → 이름만
        parts = text.rsplit(" ", 1)
        name = parts[0].strip() if len(parts) == 2 else text
        unit = parts[1].strip() if len(parts) == 2 else None
        return {"name": name, "quantity": None, "unit": unit}


def parse_recipe_page(recipe_id: str) -> dict | None:
    """개별 레시피 페이지 파싱 (JSON-LD 기반)"""
    url = f"{BASE_URL}/recipe/{recipe_id}"
    try:
        res = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        if res.status_code != 200:
            return None

        soup = BeautifulSoup(res.text, "html.parser")

        # JSON-LD 추출
        ld_tag = soup.find("script", type="application/ld+json")
        if not ld_tag:
            return None
        ld = json.loads(ld_tag.string)

        name         = ld.get("name", "").strip()
        total_time   = parse_time(ld.get("totalTime", ""))
        serving_size = ld.get("recipeYield", "")
        category     = ld.get("recipeCategory", "")
        raw_ingreds  = ld.get("recipeIngredient", [])
        raw_steps    = ld.get("recipeInstructions", [])

        if not name:
            return None

        # 재료 파싱
        ingredient_details = [parse_ingredient(i) for i in raw_ingreds]
        ingredient_names   = [d["name"] for d in ingredient_details if d["name"]]

        # 조리단계 파싱
        steps = []
        for i, s in enumerate(raw_steps):
            text = s.get("text", "").strip() if isinstance(s, dict) else str(s).strip()
            if text:
                steps.append({"step": i + 1, "description": text})

        # 필터 적용
        if len(ingredient_details) > MAX_INGREDIENTS:
            return None
        if len(steps) > MAX_STEPS:
            return None

        # 조리방법 추출 (HTML에서)
        cooking_method = None
        info_tags = soup.select(".view2_summary_info2")
        for tag in info_tags:
            text = tag.get_text(strip=True)
            for method in ["볶기", "끓이기", "굽기", "찌기", "튀기기", "조리기", "무침", "비빔", "절이기"]:
                if method in text:
                    cooking_method = method
                    break

        return {
            "name":               name,
            "category":           category,
            "cooking_method":     cooking_method or "기타",
            "cooking_level":      "초보",
            "cook_time_minutes":  total_time,
            "serving_size":       serving_size,
            "ingredients_raw":    ", ".join(raw_ingreds),
            "ingredient_names":   ingredient_names,
            "ingredient_details": ingredient_details,
            "steps":              steps,
            "source_url":         url,
            "data_source":        "만개의레시피",
        }

    except Exception as e:
        print(f"\n  파싱 오류 ({recipe_id}): {e}")
        return None


def main():
    print("=" * 55)
    print("  만개의레시피 크롤러")
    print(f"  필터: 초급 / 재료 ≤{MAX_INGREDIENTS}개 / 단계 ≤{MAX_STEPS}개")
    print("=" * 55)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 1. ID 수집
    recipe_ids = get_recipe_ids(pages=100)

    # 2. 개별 파싱
    print(f"\n[2/3] 레시피 파싱 중...")
    collected = []
    skipped   = 0

    for i, rid in enumerate(recipe_ids):
        recipe = parse_recipe_page(rid)
        if recipe:
            collected.append(recipe)
            status = f"수집 {len(collected)}개 / 건너뜀 {skipped}개"
        else:
            skipped += 1
            status = f"수집 {len(collected)}개 / 건너뜀 {skipped}개"

        print(f"  [{i+1:4d}/{len(recipe_ids)}] {status}", end="\r")
        time.sleep(SLEEP_SEC)

    print(f"\n  → 최종 수집: {len(collected)}개 (필터 통과)")

    # 3. Supabase 저장
    print(f"\n[3/3] Supabase 저장 중...")
    total_inserted = 0
    total_batches  = (len(collected) + INSERT_BATCH - 1) // INSERT_BATCH

    for i in range(0, len(collected), INSERT_BATCH):
        batch     = collected[i: i + INSERT_BATCH]
        batch_num = i // INSERT_BATCH + 1
        try:
            res = supabase.table("recipes_10000").insert(batch).execute()
            total_inserted += len(res.data)
            print(f"  배치 {batch_num:3d}/{total_batches} → {total_inserted}건 저장", end="\r")
        except Exception as e:
            print(f"\n  저장 오류 (배치 {batch_num}): {e}")

    print(f"\n\n{'=' * 55}")
    print(f"  완료! {total_inserted}개 레시피 저장")
    print(f"{'=' * 55}\n")

    # 결과 샘플 출력
    sample = supabase.table("recipes_10000").select("name, category, cook_time_minutes, cooking_level").limit(5).execute().data
    print("[저장 샘플]")
    for r in sample:
        print(f"  - {r['name']} | {r['category']} | {r['cook_time_minutes']}분 | {r['cooking_level']}")


if __name__ == "__main__":
    main()
