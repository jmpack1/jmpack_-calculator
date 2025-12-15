import streamlit as st
import numpy as np # 반올림 계산을 위해 numpy 라이브러리를 사용합니다.

# --- 페이지 기본 설정 ---
st.set_page_config(page_title="PP속봉투 단가 견적기", page_icon="⚙️")

# --- 앱 제목 ---
st.title("⚙️ PP속봉투 단가 견적기 (최종)")

# --- 사이드바: 모든 사용자 입력 ---
st.sidebar.header("견적 조건 입력")

# 1. 제품 정보 입력
with st.sidebar.expander("1. 제품 규격", expanded=True):
    width = st.number_input("가로 길이 (cm)", min_value=1.0, value=25.0, step=1.0)
    height = st.number_input("세로 길이 (cm)", min_value=1.0, value=34.0, step=1.0)
    thickness = st.selectbox("두께 (mm)", options=[0.03, 0.04, 0.05, 0.06], index=1)

# 2. 생산 조건 입력
with st.sidebar.expander("2. 생산 조건", expanded=True):
    base_length_m = st.number_input(
        "기준 m수 (원단 길이)",
        min_value=100,
        value=4000,
        step=100,
        help="이 길이를 기준으로 최소 생산 수량(MOQ)이 결정됩니다."
    )
    profit_margin_percent = st.number_input(
        "적용 마진율 (%)",
        min_value=0.0,
        value=30.0,
        step=1.0,
        help="총 원가에 이 마진율을 더해 최종 판매가를 결정합니다."
    )

# --- 계산 실행 버튼 ---
calculate_button = st.sidebar.button("🚀 견적 계산하기", type="primary")


# --- 메인 화면: 초기 안내 또는 결과 표시 ---

if not calculate_button:
    st.info("👈 왼쪽 사이드바에 견적 조건을 입력하고 '견적 계산하기' 버튼을 눌러주세요.")
    st.stop()

# --- 계산 로직 ---

# --- 엑셀 파일 분석 기반 핵심 상수 ---
FABRIC_COST_CONSTANT = 4423
PRINTING_COST_RATIO = 0.1835
BASE_PROCESSING_FEE = 6
PLATE_COST_OVER_40CM = 56000
PLATE_COST_UNDER_40CM = 113000

# 1. 원가 계산 (계산 후 즉시 반올림)
width_m = width / 100
height_m = height / 100

# [수정] 각 비용 계산 후 즉시 정수로 반올림
fabric_cost = round(width_m * height_m * thickness * FABRIC_COST_CONSTANT)
printing_cost = round(fabric_cost * PRINTING_COST_RATIO)
processing_cost = BASE_PROCESSING_FEE # 이미 정수
total_cost = fabric_cost + printing_cost + processing_cost

# 2. 동판 비용 조건부 계산
plate_cost_reason = ""
if width < 40:
    plate_cost = PLATE_COST_UNDER_40CM
    plate_cost_reason = f"가로({width}cm)가 40cm 미만"
else:
    plate_cost = PLATE_COST_OVER_40CM
    plate_cost_reason = f"가로({width}cm)가 40cm 이상"

# 3. 최소 수량(MOQ) 계산
# [수정] 엑셀 공식 SUM(E7/B3*100)*0.99 를 그대로 적용
# E7 = base_length_m, B3 = width
moq_raw = (base_length_m / width * 100) * 0.99

# [추가] 계산된 MOQ를 100단위로 반올림하는 로직
# 예: 15840 -> 15800, 15860 -> 15900
moq = round(moq_raw / 100) * 100

# 4. 최종 판매가 계산
# [수정] 반올림된 총 원가를 기준으로 계산 후, 최종가도 반올림
final_selling_price_raw = total_cost * (1 + profit_margin_percent / 100)
final_selling_price = round(final_selling_price_raw)


# --- 결과 출력 ---
st.header("📊 견적 계산 결과")

st.success(f"입력하신 조건으로 계산된 견적 결과입니다.")
col1, col2 = st.columns(2)
# [수정] 반올림된 값으로 출력
col1.metric(label="장당 최종 판매가", value=f"{final_selling_price}원")
col2.metric(label="최소 생산 수량 (MOQ)", value=f"{moq}장")

st.markdown("---")

st.subheader("상세 계산 내역")

col_a, col_b, col_c = st.columns(3)
# [수정] 모든 비용을 반올림된 정수 값으로 표시
col_a.markdown(f"**원단 비용:** `{fabric_cost}` 원")
col_b.markdown(f"**인쇄 비용:** `{printing_cost}` 원")
col_c.markdown(f"**가공 비용:** `{processing_cost}` 원")

st.markdown(f"##### **총 원가 (합계): {total_cost} 원**")
st.markdown(f"**적용 마진율:** `{profit_margin_percent:.1f}` %")
st.markdown(f"**동판 비용:** `{plate_cost:,}` 원 (*{plate_cost_reason}*)")