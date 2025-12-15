import streamlit as st
import pandas as pd
import numpy as np

# --- 페이지 기본 설정 ---
st.set_page_config(page_title="PP속봉투 원가계산기 V2", page_icon="🧾")

# --- 앱 제목 ---
st.title("🧾 PP속봉투 원가계산기 (엑셀 로직 반영)")
st.info("엑셀 파일의 계산 로직을 분석하여 동일한 결과가 나오도록 재구성했습니다.")

# --- 엑셀 파일 분석 기반 핵심 상수 ---
# 25cm x 34cm, 0.04mm 기준 15.04원의 원단가를 맞추기 위한 보정 계수
FABRIC_COST_CONSTANT = 4423
# 원단비 대비 인쇄비 비율 (엑셀: 15원 대비 3원 -> 약 20%)
PRINTING_COST_RATIO = 0.1835 # 2.76원 / 15.04원
# 고정 가공비
BASE_PROCESSING_FEE = 6
# 총원가 대비 판매가 마진율 (엑셀: 31원 / 24원)
PROFIT_MARGIN = 31 / 24
# 동판 비용 (F3, G3 셀 값)
PLATE_COST_OVER_40CM = 56000  # F3: 동판비(데스)
PLATE_COST_UNDER_40CM = 113000 # G3: 동판(데스x2)


# --- 사이드바에 사용자 입력 섹션 배치 ---
st.sidebar.header("⚙️ 제품 정보 입력")

width = st.sidebar.number_input("가로 길이 (cm)", min_value=1.0, value=25.0, step=1.0,
                                help="40cm를 기준으로 동판 비용이 변경됩니다.")
height = st.sidebar.number_input("세로 길이 (cm)", min_value=1.0, value=34.0, step=1.0)
thickness = st.sidebar.selectbox("두께 (mm)", options=[0.03, 0.04, 0.05, 0.06], index=1)


# --- 계산 로직 ---
# 입력값을 미터(m) 단위로 변환
width_m = width / 100
height_m = height / 100

# 1. 원단 비용 계산 (엑셀 값과 일치하도록 보정)
# (가로m * 세로m * 두께mm * 보정상수) = 원단 원가
fabric_cost = width_m * height_m * thickness * FABRIC_COST_CONSTANT

# 2. 인쇄 비용 계산 (원단 비용에 비례)
printing_cost = fabric_cost * PRINTING_COST_RATIO

# 3. 가공 비용 (고정값)
processing_cost = BASE_PROCESSING_FEE

# 4. 총 원가 계산
total_cost = fabric_cost + printing_cost + processing_cost

# 5. 최종 판매가 계산 (엑셀 마진율 적용)
selling_price = total_cost * PROFIT_MARGIN

# 6. 동판 비용 조건부 계산
if width < 40:
    plate_cost = PLATE_COST_UNDER_40CM
    plate_cost_reason = f"가로({width}cm)가 40cm 미만"
else:
    plate_cost = PLATE_COST_OVER_40CM
    plate_cost_reason = f"가로({width}cm)가 40cm 이상"


# --- 결과 출력 ---
st.header("📊 계산 결과")
st.write(f"입력하신 **{width}cm x {height}cm x {thickness}mm** 규격의 예상 단가입니다.")

# 결과를 2개의 컬럼으로 나누어 깔끔하게 표시
col1, col2 = st.columns(2)
col1.metric(label="장당 예상 판매가", value=f"{selling_price:.0f}원")
col2.metric(label="동판 비용 (VAT 별도)", value=f"{plate_cost:,}원",
            help=plate_cost_reason)

st.markdown("---") # 구분선

# 원가 구성 시각화
st.subheader("🔬 원가 구성 비율")
cost_data = {
    '비용 항목': ['원단 비용', '인쇄 비용', '가공 비용'],
    '금액 (원)': [fabric_cost, printing_cost, processing_cost]
}
df_cost = pd.DataFrame(cost_data)

# 막대 차트로 시각화
st.bar_chart(df_cost.set_index('비용 항목'))

# 상세 내역을 표로 보여주기
with st.expander("🔢 상세 계산 내역 보기"):
    st.dataframe(df_cost.set_index('비용 항목').style.format("{:.2f}원"))
    st.markdown(f"**총 원가:** `{total_cost:.2f}원`")
    st.markdown(f"**적용 마진율:** `{PROFIT_MARGIN:.2%}`")
    st.markdown(f"**최종 판매가 (반올림 전):** `{selling_price:.2f}원`")