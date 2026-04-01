"""
냉장고 탐정 - 레시피 CSV → Supabase 임포트 스크립트
대상 파일: recipes_full.csv (식품안전나라 공공데이터, CP949 인코딩)
"""

import csv
import json
import re
import sys
from pathlib import Path
from supabase import create_client, Client

# ─── 설정 ────────────────────────────────────────────────
CSV_PATH = r"C:\Users\korea\서비스데이터사이언스\KIMFILE\recipes_full.csv"
SUPABASE_URL = "https://krkdimdbtegowmuumnrt.supabase.co"
SUPABASE_KEY = "sb_publishable_2l3cu7vD-m19rzpXZbYbGA_Y7qvznFe"
BATCH_SIZE = 50  # 한 번에 INSERT할 레코드 수
# ─────────────────────────────────────────────────────────


def parse_ingredient_names(raw: str) -> list[str]:
    """
    RCP_PARTS_DTLS 원문에서 재료명만 추출.

    예시 원문:
      깻잎볶음\n깻잎 75g(3/4단), 콩나물 20g(5뿌리), 대파 30g(1/2대)\n양념\n간장 5g(1작은술)
    결과:
      ["깻잎", "콩나물", "대파", "간장"]
    """
    if not raw:
        return []

    # 줄바꿈을 쉼표로 통일
    text = raw.replace("\n", ",")

    # 제목행 제거 패턴 (예: "깻잎볶음", "양념", "소스" 등 수량 없는 단독 행)
    parts = text.split(",")
    names = []

    for part in parts:
        part = part.strip()
        if not part:
            continue

        # 괄호 내용 제거: "75g(3/4단)" → "75g"
        cleaned = re.sub(r"\([^)]*\)", "", part)

        # 수량/단위 제거
        # 예: "깻잎 75g" → "깻잎"
        name = re.sub(
            r"\s*[\d./]+\s*(g|kg|ml|L|리터|cc|개|컵|큰술|작은술|T|t|뿌리|단|조각|장|마리|쪽|줄기|포기|봉지|캔|병|통|팩)\.?\s*",
            "",
            cleaned,
            flags=re.IGNORECASE,
        ).strip()

        # 너무 짧거나 숫자만 남은 경우 제외
        if len(name) <= 1 or re.fullmatch(r"[\d\s./]+", name):
            continue

        # 중복 제거 후 추가
        if name not in names:
            names.append(name)

    return names


def parse_steps(row: dict) -> list[dict]:
    """
    MANUAL01~MANUAL06을 [{step, description}] JSON 배열로 정규화.
    이미지 URL은 베타 제외.
    """
    steps = []
    for i in range(1, 7):
        key = f"MANUAL0{i}"
        text = row.get(key, "").strip()
        if not text:
            continue

        # 앞의 "1. ", "2. " 같은 번호 제거
        text = re.sub(r"^\d+\.\s*", "", text)

        # 조리 단계 끝에 붙은 .a .b .c 같은 아티팩트 제거
        text = re.sub(r"\s*\.[a-z]$", "", text).strip()

        steps.append({"step": i, "description": text})

    return steps


def parse_hash_tags(raw: str) -> list[str]:
    """HASH_TAG 파싱: 쉼표 또는 공백 구분 → 배열"""
    if not raw:
        return []
    tags = re.split(r"[,\s]+", raw.strip())
    return [t for t in tags if t]


def transform_row(row: dict) -> dict:
    """CSV 행 1개를 Supabase INSERT용 dict로 변환"""
    return {
        "rcp_seq": int(row["RCP_SEQ"]),
        "name": row["RCP_NM"].strip(),
        "category": row["RCP_PAT2"].strip(),
        "cooking_method": row["RCP_WAY2"].strip(),
        "ingredients_raw": row["RCP_PARTS_DTLS"].strip() or None,
        "ingredient_names": parse_ingredient_names(row["RCP_PARTS_DTLS"]),
        "steps": parse_steps(row),
        "hash_tags": parse_hash_tags(row["HASH_TAG"]),
    }


def batch_insert(client: Client, records: list[dict]) -> int:
    """Supabase에 배치 INSERT. 성공한 건수 반환."""
    response = client.table("recipes").insert(records).execute()
    return len(response.data) if response.data else 0


def main():
    print("=" * 55)
    print("  냉장고 탐정 레시피 임포트 시작")
    print("=" * 55)

    # 1. CSV 로드
    print(f"\n[1/3] CSV 로딩: {CSV_PATH}")
    try:
        with open(CSV_PATH, encoding="cp949") as f:
            rows = list(csv.DictReader(f))
    except FileNotFoundError:
        print(f"  오류: 파일을 찾을 수 없습니다 — {CSV_PATH}")
        sys.exit(1)
    print(f"  → 총 {len(rows)}개 레시피 로드 완료")

    # 2. 변환
    print("\n[2/3] 데이터 변환 중...")
    records = []
    for row in rows:
        try:
            records.append(transform_row(row))
        except Exception as e:
            print(f"  경고: RCP_SEQ={row.get('RCP_SEQ')} 변환 실패 — {e}")
    print(f"  → {len(records)}개 변환 완료")

    # 변환 결과 샘플 출력
    sample = records[0]
    print(f"\n  [샘플] {sample['name']}")
    print(f"    카테고리: {sample['category']} / 조리법: {sample['cooking_method']}")
    print(f"    재료명: {sample['ingredient_names'][:5]} ...")
    print(f"    조리단계: {len(sample['steps'])}단계")

    # 3. Supabase 업로드
    print(f"\n[3/3] Supabase 업로드 중 (배치 크기: {BATCH_SIZE})")
    client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    total_inserted = 0
    total_batches = (len(records) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        try:
            inserted = batch_insert(client, batch)
            total_inserted += inserted
            print(f"  배치 {batch_num:3d}/{total_batches} → {inserted}건 INSERT", end="\r")
        except Exception as e:
            print(f"\n  오류: 배치 {batch_num} 실패 — {e}")
            # 실패 시 해당 배치 1건씩 재시도
            for rec in batch:
                try:
                    inserted = batch_insert(client, [rec])
                    total_inserted += inserted
                except Exception as e2:
                    print(f"    RCP_SEQ={rec['rcp_seq']} 개별 실패 — {e2}")

    print(f"\n\n{'=' * 55}")
    print(f"  완료! 총 {total_inserted}/{len(records)}건 업로드")
    print(f"{'=' * 55}\n")


if __name__ == "__main__":
    main()
