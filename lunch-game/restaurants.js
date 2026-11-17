// 기본 식당 데이터
// tags: hearty(든든) / light(가볍게) / spicy(매운) / soup(국물)
window.JM_DATA = {
  categories: {
    '국밥·탕': '🍲',
    '찌개·전골': '🥘',
    '중식': '🥟',
    '고기·구이': '🥩',
    '돈까스·일식': '🍱',
    '면·국수': '🍜',
    '한식·백반': '🍚',
    '분식': '🍢',
    '치킨·버거': '🍗',
    '양식·기타': '🍝',
  },

  // ⭐ 우리 회사 단골 (직원 추천)
  favorites: [
    { id: 'f_jangsuchon', name: '장수촌순대국', cat: '국밥·탕', menu: '순대국', tags: ['soup', 'hearty'] },
    { id: 'f_mimi', name: '미미반점', cat: '중식', menu: '짜장면 · 짬뽕', tags: ['spicy', 'hearty'] },
    { id: 'f_ijo', name: '이조명가옛날육계장', cat: '국밥·탕', menu: '육개장', tags: ['soup', 'spicy'] },
    { id: 'f_neobegi', name: '너베기두루치기삼겹살', cat: '고기·구이', menu: '두루치기 · 삼겹살', tags: ['hearty', 'spicy'] },
    { id: 'f_songga', name: '송가네부대찌개', cat: '찌개·전골', menu: '부대찌개', tags: ['soup', 'spicy', 'hearty'] },
    { id: 'f_oneuldo', name: '오늘도돈까스', cat: '돈까스·일식', menu: '돈까스', tags: ['hearty'] },
    { id: 'f_abuji', name: '아부지국밥', cat: '국밥·탕', menu: '국밥', tags: ['soup', 'hearty'] },
    { id: 'f_bangil', name: '방일해장국', cat: '국밥·탕', menu: '해장국', tags: ['soup', 'hearty'] },
  ],

  // 👍 가산면 일대 추천 (웹 검색 기반 · 영업정보는 방문 전 확인 권장)
  recommended: [
    { id: 'r_haeryong', name: '해룡마을 국수집 가산점', cat: '면·국수', menu: '콩국수 · 곰탕국수', tags: ['light', 'soup'], addr: '포천시 가산면 가산로 80', note: '일요일 휴무' },
    { id: 'r_mojeong', name: '모정추어탕', cat: '국밥·탕', menu: '추어탕', tags: ['soup', 'hearty'], addr: '포천시 가산면 가산로318번길 6' },
    { id: 'r_gangnam', name: '강남동태탕', cat: '찌개·전골', menu: '동태탕 · 대구뽈탕', tags: ['soup', 'spicy'] },
    { id: 'r_cheongpyeong', name: '청평돼지불백', cat: '한식·백반', menu: '돼지불백', tags: ['hearty'], addr: '포천시 포천로 581' },
    { id: 'r_gasansaeng', name: '가산생고기', cat: '고기·구이', menu: '생고기 · 점심식사', tags: ['hearty'], addr: '포천시 가산면 가산로309번길 1' },
  ],
};
