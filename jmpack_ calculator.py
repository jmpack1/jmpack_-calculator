import streamlit as st

# --- 페이지 기본 설정 ---
st.set_page_config(page_title="PP속봉투 단가 견적기", page_icon="⚙️")

# --- 앱 제목 ---
st.title("⚙️ PP속봉투 단가 견적기")

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

# 버튼을 누르기 전에는 안내 메시지만 표시
if not calculate_button:
    st.info("👈 왼쪽 사이드바에 견적 조건을 입력하고 '견적 계산하기' 버튼을 눌러주세요.")
    st.stop() # 버튼을 누르기 전까지는 아래 코드를 실행하지 않음

# --- 버튼을 누른 후: 계산 로직 및 결과 표시 ---

# --- 엑셀 파일 분석 기반 핵심 상수 ---
FABRIC_COST_CONSTANT = 4423
PRINTING_COST_RATIO = 0.1835
BASE_PROCESSING_FEE = 6
PLATE_COST_OVER_40CM = 56000
PLATE_COST_UNDER_40CM = 113000
# 엑셀의 '34cm + 4cm'에서 착안한 봉투 1개당 필요한 원단 길이 계산용 여유분(m)
EXTRA_LENGTH_FOR_BAG = 0.04

# --- 계산 로직 ---
# 단위를 미터(m)로 변환
width_m = width / 100
height_m = height / 100

# 1. 원가 계산
fabric_cost = width_m * height_m * thickness * FABRIC_COST_CONSTANT
printing_cost = fabric_cost * PRINTING_COST_RATIO
processing_cost = BASE_PROCESSING_FEE
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
# (기준 m수) / (봉투 1개당 필요한 길이)
moq = base_length_m / (height_m + EXTRA_LENGTH_FOR_BAG)

# 4. 최종 판매가 계산 (사용자 입력 마진율 적용)
final_selling_price = total_cost * (1 + profit_margin_percent / 100)

# --- 결과 출력 ---
st.header("📊 견적 계산 결과")

# 최종 결과값 강조 표시
st.success(f"입력하신 조건으로 계산된 견적 결과입니다.")
col1, col2 = st.columns(2)
col1.metric(label="장당 최종 판매가", value=f"{final_selling_price:.0f}원")
col2.metric(label="최소 생산 수량 (MOQ)", value=f"{moq:,.0f}장")

st.markdown("---")

# 상세 내역 표시
st.subheader("상세 계산 내역")

# 컬럼을 사용하여 깔끔하게 정렬
col_a, col_b, col_c = st.columns(3)
col_a.markdown(f"**원단 비용:** `{fabric_cost:.2f}` 원")
col_b.markdown(f"**인쇄 비용:** `{printing_cost:.2f}` 원")
col_c.markdown(f"**가공 비용:** `{processing_cost:.2f}` 원")

st.markdown(f"##### **총 원가 (합계): {total_cost:.2f} 원**")
st.markdown(f"**적용 마진율:** `{profit_margin_percent:.1f}` %")
st.markdown(f"**동판 비용:** `{plate_cost:,}` 원 (*{plate_cost_reason}*)")