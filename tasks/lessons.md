# Lessons Learned

## 2025-05-03

### L01 — DB 스키마를 코드보다 먼저 확인하라
**상황:** `recipes_10000`에 `category` 컬럼이 없는데 SQL/코드 전체에 `category`를 사용하여 여러 번 에러 발생  
**규칙:** 테이블 컬럼 변경 작업 시 반드시 먼저 `information_schema.columns` 쿼리로 실제 스키마 확인 후 진행

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = '테이블명'
ORDER BY ordinal_position;
```

---

### L02 — Python 모듈명을 변수명으로 사용하지 말 것
**상황:** `time = r.get("cook_time_minutes", "")` 으로 인해 `import time` 모듈이 섀도잉되어 `UnboundLocalError` 발생  
**규칙:** `time`, `os`, `json`, `re` 등 표준 라이브러리 이름은 변수명으로 절대 사용 금지. `cook_time`, `elapsed_time` 등으로 대체

---

### L03 — 코드 제공 시 실행 위치를 항상 명시하라
**상황:** Python 코드를 PowerShell에 직접 붙여넣어 파서 에러 발생  
**규칙:** 모든 코드 블록에 실행 위치 명시
- `📍 터미널 (PowerShell)`
- `📍 Supabase SQL Editor`
- `📍 브라우저 콘솔`

---

### L04 — Supabase SQL 변경은 즉시 전체 팀에 적용됨
**상황:** `search_recipes_by_embedding` RPC에서 `category` 제거 후, 팀원 코드가 해당 컬럼을 참조할 경우 런타임 에러 발생 가능  
**규칙:** RPC/테이블 스키마 변경 전 팀원 코드에서 해당 컬럼/함수 사용 여부 확인. 변경 후 즉시 팀에 공유

---

### L05 — 테이블 전환 시 참조 파일 전체를 한 번에 파악하라
**상황:** `recipes` → `recipes_10000` 전환 시 `generate_embeddings.py`의 select 쿼리에 `category`가 남아 있어 추가 에러 발생  
**규칙:** 테이블명 변경 작업 전 `Grep`으로 전체 참조 파일 목록 확인 후 일괄 수정
