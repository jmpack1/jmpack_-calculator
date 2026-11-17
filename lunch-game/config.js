// =====================================================================
//  JM 런치 배틀 설정 파일
//  - 아래 두 값만 채우면 "여러 폰 실시간 참여" + "카카오 기능"이 켜집니다.
//  - 비워두면 '체험 모드'(한 기기 안에서만 동기화)로 동작합니다.
// =====================================================================
window.JM_CONFIG = {
  // 회사 주소 (카카오맵 15분 반경 검색 기준점)
  COMPANY_ADDRESS: '경기도 포천시 가산면 메나리길 90',
  COMPANY_NAME: 'JMPACK',

  // 차량 1대 기준 최대 인원
  MAX_PLAYERS: 5,

  // 차로 몇 분 이내 식당까지 불러올지
  MAX_DRIVE_MIN: 15,

  // 1) Firebase Realtime Database 설정 (README 참고)
  //    예: { apiKey: "...", authDomain: "...", databaseURL: "https://xxx-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "..." }
  FIREBASE: {
    apiKey: 'AIzaSyCimZ1vVCrF_7FMV796W0Gy8y0pHqDeuK4',
    authDomain: 'jm-lunch.firebaseapp.com',
    databaseURL: 'https://jm-lunch-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'jm-lunch',
    storageBucket: 'jm-lunch.firebasestorage.app',
    messagingSenderId: '113945424661',
    appId: '1:113945424661:web:91e62a90b94cc4b5466f1c',
  },

  // 2) 카카오 JavaScript 키 (developers.kakao.com → 내 애플리케이션 → 앱 키)
  //    카카오톡 공유 + 카카오맵 맛집 자동 불러오기에 사용
  KAKAO_JS_KEY: 'd630fbe7ed4c2a9f11c9149420e39832',
};
