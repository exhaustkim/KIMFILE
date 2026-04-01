"""
냉장고 탐정 - OCR 마이크로서비스 (FastAPI + PaddleOCR 3.x)
실행: python -m uvicorn ocr_server.main:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import re
import logging
from contextlib import asynccontextmanager

# Windows oneDNN 충돌 방지 (서버 시작 전 반드시 설정)
os.environ["PADDLE_USE_ONEDNN"] = "0"
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["DNNL_VERBOSE"] = "0"
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCR
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ocr_engine: PaddleOCR | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global ocr_engine
    logger.info("PaddleOCR 모델 로딩 중...")
    # paddle은 이미 paddleocr import 시 sys.modules에 로딩됨
    # → 여기서 import paddle.inference는 DLL 재로딩 없이 캐시된 모듈 반환
    # → create_predictor 호출 전에 config.disable_mkldnn() 주입
    try:
        import paddle.inference as _pi
        _orig_cp = _pi.create_predictor

        def _create_predictor_no_mkldnn(config):
            try:
                config.disable_mkldnn()
            except Exception:
                pass
            return _orig_cp(config)

        _pi.create_predictor = _create_predictor_no_mkldnn
        logger.info("paddle.inference mkldnn 비활성화 패치 적용")
    except Exception as e:
        logger.warning(f"mkldnn 패치 실패 (무시): {e}")
    ocr_engine = PaddleOCR(
        lang="korean",
        text_detection_model_name="PP-OCRv5_mobile_det",    # server_det → oneDNN 충돌 우회
        text_recognition_model_name="korean_PP-OCRv5_mobile_rec",  # server_rec → mobile
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )
    logger.info("PaddleOCR 준비 완료")
    yield


app = FastAPI(title="냉장고 탐정 OCR 서비스", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://krkdimdbtegowmuumnrt.supabase.co"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


# ── 영수증 파싱 유틸 ───────────────────────────────────────

EXCLUDE_KEYWORDS = {
    "합계", "총액", "결제", "카드", "현금", "거스름돈", "부가세", "vat",
    "영수증", "사업자", "전화", "주소", "대표", "점", "마트", "슈퍼",
    "할인", "포인트", "적립", "사용", "잔액", "승인", "번호",
    "날짜", "시간", "date", "time", "tel", "fax",
    "%", "ea",
}

PRICE_PATTERN    = re.compile(r"^\d[\d,]*\s*원?$")
QUANTITY_PATTERN = re.compile(r"^\d+\s*(g|kg|ml|l|개|봉|팩|묶음|단|마리|조각|통)?$", re.I)


def preprocess_image(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("이미지를 디코딩할 수 없습니다")

    h, w = img.shape[:2]
    if max(h, w) > 2000:
        scale = 2000 / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)))

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)


def clean_ingredient_name(text: str) -> str:
    text = re.sub(r"[★☆◆◇■□▶▷※*]", "", text)
    text = re.sub(r"\(.*?\)|\[.*?\]", "", text)
    text = re.sub(r"(국내산|수입산|국산|미국산|호주산|캐나다산)\s*", "", text)
    text = re.sub(r"[^\w가-힣\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_ingredients_from_results(results) -> tuple[list[str], list[dict]]:
    """
    PaddleOCR 3.x 결과(OCRResult 객체 리스트)에서
    전체 텍스트와 식재료 후보를 추출.
    """
    raw_texts: list[str] = []
    candidates: list[dict] = []
    seen: set[str] = set()

    for page_result in results:
        # 3.x: page_result는 OCRResult 객체
        # page_result['rec_texts'], page_result['rec_scores'] 로 접근
        texts  = page_result.get("rec_texts", [])
        scores = page_result.get("rec_scores", [])

        for text, score in zip(texts, scores):
            text = text.strip()
            if not text:
                continue

            raw_texts.append(text)

            if score < 0.6:
                continue
            if len(text) < 2:
                continue
            if PRICE_PATTERN.match(text):
                continue
            if QUANTITY_PATTERN.match(text):
                continue

            lower = text.lower()
            if any(kw in lower for kw in EXCLUDE_KEYWORDS):
                continue
            if not re.search(r"[가-힣]", text):
                continue

            cleaned = clean_ingredient_name(text)
            if cleaned and len(cleaned) >= 2 and cleaned not in seen:
                seen.add(cleaned)
                candidates.append({"text": cleaned, "confidence": round(float(score), 3)})

    return raw_texts, candidates


# ── 응답 모델 ─────────────────────────────────────────────

class IngredientCandidate(BaseModel):
    text: str
    confidence: float

class OCRResponse(BaseModel):
    raw_texts: list[str]
    ingredients: list[IngredientCandidate]
    image_size: tuple[int, int]


# ── 엔드포인트 ────────────────────────────────────────────

@app.post("/ocr/receipt", response_model=OCRResponse)
async def ocr_receipt(file: UploadFile = File(...)):
    """
    영수증 이미지 → 식재료 후보 텍스트 추출.
    클라이언트는 반환된 ingredients를 사용자에게 보여주고
    확정 후 POST /api/inventory/bulk 로 저장.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드 가능합니다")

    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="이미지 크기는 10MB 이하여야 합니다")

    try:
        img = preprocess_image(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    results = ocr_engine.predict(img)
    raw_texts, candidates = extract_ingredients_from_results(results)

    h, w = img.shape[:2]
    return OCRResponse(
        raw_texts=raw_texts,
        ingredients=[IngredientCandidate(**c) for c in candidates],
        image_size=(w, h),
    )


@app.get("/health")
async def health():
    return {"status": "ok", "ocr_ready": ocr_engine is not None}
