"""
recipes_10000 데이터 백업 스크립트
Excel에서 한글 정상 표시를 위해 utf-8-sig(BOM 포함) 인코딩으로 저장
"""

import csv
from supabase import create_client

SUPABASE_URL = "https://krkdimdbtegowmuumnrt.supabase.co"
SUPABASE_KEY = input("Supabase service_role 키를 입력하세요: ").strip()

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 전체 데이터 수집 (페이지네이션)
recipes = []
page_size = 1000
offset = 0
while True:
    batch = (
        supabase.table("recipes_10000")
        .select("*")
        .range(offset, offset + page_size - 1)
        .execute()
        .data
    )
    recipes.extend(batch)
    print(f"  수집 중... {len(recipes)}개", end="\r")
    if len(batch) < page_size:
        break
    offset += page_size

print(f"\n총 {len(recipes)}개 수집 완료")

if not recipes:
    print("데이터가 없습니다.")
else:
    output_file = "recipes_10000_backup.csv"
    with open(output_file, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=recipes[0].keys())
        writer.writeheader()
        writer.writerows(recipes)
    print(f"저장 완료: {output_file}")
