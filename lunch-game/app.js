/* JM 런치 배틀 - 점심 메뉴 결정 참여형 게임
 * 흐름: 대기실 → 컨디션 → 하트 투표 → 거부권 → 식당 투표 → 룰렛 → 결과(카톡 공유)
 * 동기화: Firebase Realtime DB (설정 시) / 로컬 체험 모드(같은 기기 탭끼리)
 */
(() => {
  'use strict';
  const CFG = window.JM_CONFIG || {};
  const DATA = window.JM_DATA;
  const CATS = DATA.categories;
  const MAX = CFG.MAX_PLAYERS || 5;
  const MAX_MIN = CFG.MAX_DRIVE_MIN || 15;
  const PHASE_MS = { mood: 15000, hearts: 30000, veto: 15000, pick: 20000, roulette: 7000 };
  const STEPS = { mood: 1, hearts: 2, veto: 3, pick: 4, roulette: 5 };
  const MOODS = [
    { k: 'hearty', ic: '🔥', t: '든든하게' },
    { k: 'light', ic: '🥗', t: '가볍게' },
    { k: 'spicy', ic: '🌶️', t: '매운 거' },
    { k: 'soup', ic: '🍲', t: '국물' },
    { k: 'any', ic: '😴', t: '아무거나' },
  ];
  const EMOJIS = ['🐻', '🐯', '🐶', '🐱', '🐰', '🦊', '🐼', '🐸', '🐵', '🐧', '🐷', '🦁'];
  const WHEEL_COLORS = ['#ff7a3d', '#ffb23d', '#2fb67c', '#3d8bff', '#a35cff'];
  const HEARTS = 3;

  const $ = (s) => document.querySelector(s);
  const app = $('#app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 날짜 (한국 시간) ----------
  const seoulDate = (offsetDays = 0) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 864e5).toISOString().slice(0, 10);
  const TODAY = seoulDate();
  const ROOM_ID = (new URLSearchParams(location.search).get('room') || TODAY).replace(/[^\w-]/g, '');
  const RP = `rooms/${ROOM_ID}`;

  // ---------- 시드 랜덤 (모든 폰이 같은 결과를 계산) ----------
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = hash(seed); return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ---------- 저장소 ----------
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  function getAt(tree, path) { let n = tree; for (const k of path.split('/')) { if (n == null) return null; n = n[k]; } return n ?? null; }
  function setAt(tree, path, val) {
    const ks = path.split('/'); let n = tree;
    for (let i = 0; i < ks.length - 1; i++) { if (typeof n[ks[i]] !== 'object' || n[ks[i]] === null) n[ks[i]] = {}; n = n[ks[i]]; }
    const last = ks[ks.length - 1];
    if (val === null || val === undefined) delete n[last]; else n[last] = clone(val);
  }
  function stripNulls(v) {
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) { if (v[k] === null || v[k] === undefined) delete v[k]; else stripNulls(v[k]); } }
    return v;
  }

  function LocalStore() {
    const KEY = 'jmlunch-db';
    let mem = {};
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return mem; } };
    const save = (t) => { mem = t; try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* 저장 불가 환경 */ } };
    let tree = load();
    const subs = new Set();
    let bc = null;
    try { bc = new BroadcastChannel('jmlunch'); bc.onmessage = () => { tree = load(); emit(); }; } catch { /* 미지원 */ }
    window.addEventListener('storage', (e) => { if (e.key === KEY) { tree = load(); emit(); } });
    let pending = false;
    function emit() { if (pending) return; pending = true; queueMicrotask(() => { pending = false; subs.forEach((s) => s.cb(clone(getAt(tree, s.path)))); }); }
    function commit() { save(tree); emit(); try { bc && bc.postMessage(1); } catch { /* noop */ } }
    return {
      mode: 'local',
      now: () => Date.now(),
      on(path, cb) { const s = { path, cb }; subs.add(s); cb(clone(getAt(tree, path))); return () => subs.delete(s); },
      async get(path) { tree = load(); return clone(getAt(tree, path)); },
      async set(path, val) { tree = load(); setAt(tree, path, val); commit(); },
      async update(path, obj) { tree = load(); for (const k of Object.keys(obj)) setAt(tree, `${path}/${k}`, obj[k]); commit(); },
      async transaction(path, fn) {
        tree = load();
        const nv = fn(clone(getAt(tree, path)));
        if (nv === undefined) return false;
        setAt(tree, path, stripNulls(nv)); commit(); return true;
      },
    };
  }

  function FirebaseStore(cfg) {
    firebase.initializeApp(cfg);
    const db = firebase.database();
    let offset = 0;
    db.ref('.info/serverTimeOffset').on('value', (s) => { offset = s.val() || 0; });
    return {
      mode: 'firebase',
      now: () => Date.now() + offset,
      on(path, cb) { const r = db.ref(path); const h = (s) => cb(s.val()); r.on('value', h); return () => r.off('value', h); },
      get: (p) => db.ref(p).get().then((s) => s.val()),
      set: (p, v) => db.ref(p).set(v),
      update: (p, o) => db.ref(p).update(o),
      transaction: (p, fn) => db.ref(p).transaction((cur) => { const v = fn(cur); return v === undefined ? undefined : stripNulls(v); }).then((r) => r.committed),
    };
  }

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load fail: ' + src)); document.head.appendChild(s); });
  }

  // ---------- 상태 ----------
  let store;
  let room = null;
  let history = {};
  let rdb = {}; // restaurants/ : custom, disabled, kakao, discovered, discoveredAt
  let screen = 'game';
  let me = loadMe();
  let lastRenderKey = '';
  let spunKey = '';
  let busy = false;

  function loadMe() {
    try { const m = JSON.parse(localStorage.getItem('jmlunch-me')); if (m && m.id) return m; } catch { /* noop */ }
    return { id: 'p' + Math.random().toString(36).slice(2, 10), name: '', emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)] };
  }
  function saveMe() { try { localStorage.setItem('jmlunch-me', JSON.stringify(me)); } catch { /* noop */ } }

  function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms); }

  // ---------- 식당 풀 ----------
  const norm = (s) => String(s || '').replace(/\s|[()]/g, '').toLowerCase();
  function pool({ includeDisabled = false } = {}) {
    const kakao = rdb.kakao || {};
    const base = [
      ...DATA.favorites.map((r) => ({ ...r, src: 'fav' })),
      ...DATA.recommended.map((r) => ({ ...r, src: 'web' })),
      ...Object.values(rdb.custom || {}).map((r) => ({ ...r, src: 'custom' })),
    ].map((r) => ({ ...r, ...(kakao[r.id] || {}) }));
    const names = base.map((r) => norm(r.name));
    const disc = Object.values(rdb.discovered || {}).filter((d) => {
      const n = norm(d.name);
      return !names.some((x) => x && (n.includes(x) || x.includes(n)));
    }).map((r) => ({ ...r, src: 'kakao' }));
    const all = [...base, ...disc];
    return includeDisabled ? all : all.filter((r) => !(rdb.disabled || {})[r.id]);
  }
  function recentIds() {
    const cut = seoulDate(-7);
    const ids = new Set();
    for (const [d, h] of Object.entries(history || {})) if (d >= cut && h && h.id) ids.add(h.id);
    return ids;
  }
  function availablePool() {
    const rec = recentIds();
    const p = pool();
    const fresh = p.filter((r) => !rec.has(r.id));
    return fresh.length >= 2 ? fresh : p;
  }
  const snap = (r) => ({ id: r.id, name: r.name, cat: r.cat, menu: r.menu || '', src: r.src || '', min: r.min ?? null, kakaoId: r.kakaoId || null, addr: r.addr || '', note: r.note || '' });

  // ---------- 참가자 ----------
  function playersSorted(r = room) { return Object.entries((r && r.players) || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.t - b.t); }
  function activePlayers(r = room) { return playersSorted(r).slice(0, MAX); }
  function roster(r = room) { return (r && r.roster) || []; }
  function playerOf(id) { return (room && room.players && room.players[id]) || { name: '?', emoji: '❔' }; }
  const isBot = (id) => id.startsWith('bot_');

  // ---------- 집계 ----------
  function moodTally(r) { const t = {}; for (const v of Object.values(r.mood || {})) t[v] = (t[v] || 0) + 1; return t; }
  function heartTally(r) { const t = {}; for (const h of Object.values(r.hearts || {})) for (const [c, n] of Object.entries(h || {})) t[c] = (t[c] || 0) + n; return t; }
  function vetoTally(r) { const t = {}; for (const v of Object.values(r.veto || {})) if (v && v !== 'none') t[v] = (t[v] || 0) + 1; return t; }
  const heartSum = (h) => Object.values(h || {}).reduce((a, b) => a + b, 0);

  function hasVoted(r, pid) {
    switch (r.phase) {
      case 'mood': return !!(r.mood && r.mood[pid]);
      case 'hearts': return heartSum(r.hearts && r.hearts[pid]) >= HEARTS;
      case 'veto': return !!(r.veto && r.veto[pid]);
      case 'pick': return !!(r.pick && r.pick[pid]);
      default: return true;
    }
  }
  const allVoted = (r) => roster(r).length > 0 && roster(r).every((pid) => hasVoted(r, pid));

  // ---------- 단계 전환 (결정론적 계산) ----------
  function rankCategories(r) {
    const rand = rng(`${ROOM_ID}:${r.round}:cats`);
    const mt = moodTally(r);
    const ap = availablePool();
    const byCat = {};
    ap.forEach((x) => { (byCat[x.cat] = byCat[x.cat] || []).push(x); });
    const scored = Object.entries(byCat).map(([cat, rs]) => {
      let s = Math.min(rs.length, 4) * 0.4 + rand() * 0.6;
      for (const m of MOODS) {
        if (m.k === 'any' || !mt[m.k]) continue;
        const frac = rs.filter((x) => (x.tags || []).includes(m.k)).length / rs.length;
        s += mt[m.k] * frac * 1.5;
      }
      return { cat, s };
    }).sort((a, b) => b.s - a.s);
    return scored.slice(0, 6).map((x) => x.cat);
  }

  function pickCandidates(r, cats, backup = []) {
    const rand = rng(`${ROOM_ID}:${r.round}:cands`);
    const ap = availablePool();
    const out = [];
    const quota = cats.length === 1 ? [4] : [2, 2, 2];
    cats.forEach((c, i) => {
      const favFirst = shuffle(ap.filter((x) => x.cat === c), rand).sort((a, b) => (a.src === 'fav' ? 0 : 1) - (b.src === 'fav' ? 0 : 1));
      out.push(...favFirst.slice(0, quota[i] || 1));
    });
    if (out.length < 4) {
      const rest = shuffle(ap.filter((x) => cats.includes(x.cat) && !out.includes(x)), rand);
      out.push(...rest.slice(0, 4 - out.length));
    }
    // 후보가 부족하면 거부되지 않은 다음 순위 카테고리에서 채움
    for (const c of backup) {
      if (out.length >= 3) break;
      const more = shuffle(ap.filter((x) => x.cat === c && !out.includes(x)), rand);
      out.push(...more.slice(0, Math.min(2, 4 - out.length)));
    }
    return out.slice(0, 4).map(snap);
  }

  function transition(r, from) {
    const now = store.now();
    const n = { ...r, step: (r.step || 0) + 1 };
    const ends = (p) => now + PHASE_MS[p];
    if (from === 'lobby') {
      Object.assign(n, { phase: 'mood', phaseEnds: ends('mood'), roster: activePlayers(r).map((p) => p.id),
        mood: null, hearts: null, veto: null, pick: null, cats: null, vetoCats: null, cands: null, wheel: null, winner: null });
    } else if (from === 'mood') {
      const cats = rankCategories(r);
      Object.assign(n, { phase: 'hearts', phaseEnds: ends('hearts'), cats });
    } else if (from === 'hearts') {
      const ht = heartTally(r);
      const order = (r.cats || []).slice().sort((a, b) => (ht[b] || 0) - (ht[a] || 0));
      Object.assign(n, { phase: 'veto', phaseEnds: ends('veto'), vetoCats: order.slice(0, Math.min(4, order.length)) });
    } else if (from === 'veto') {
      const vt = vetoTally(r);
      let remain = (r.vetoCats || []).filter((c) => !vt[c]);
      if (!remain.length) remain = (r.vetoCats || []).slice().sort((a, b) => (vt[a] || 0) - (vt[b] || 0)).slice(0, 1);
      const ht = heartTally(r);
      const backup = (r.cats || []).filter((c) => !vt[c] && !remain.slice(0, 2).includes(c)).sort((a, b) => (ht[b] || 0) - (ht[a] || 0));
      const cands = pickCandidates(r, remain.slice(0, 2), backup);
      const finalCats = [...new Set(cands.map((c) => c.cat))];
      Object.assign(n, { phase: 'pick', phaseEnds: ends('pick'), finalCats, cands });
    } else if (from === 'pick') {
      const cands = r.cands || [];
      const w = {};
      for (const [pid, rid] of Object.entries(r.pick || {})) {
        const yielded = r.veto && r.veto[pid] === 'none';
        w[rid] = (w[rid] || 0) + (yielded ? 1.5 : 1);
      }
      let wheel = cands.map((c) => ({ id: c.id, w: w[c.id] || 0 })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w).slice(0, 3);
      if (!wheel.length) wheel = cands.map((c) => ({ id: c.id, w: 1 }));
      const total = wheel.reduce((a, b) => a + b.w, 0);
      let winner;
      let direct = false;
      if (wheel.length === 1 || (wheel[0].w / total >= 0.6 && Object.keys(r.pick || {}).length >= 2)) {
        winner = wheel[0].id; direct = true;
      } else {
        const rand = rng(`${ROOM_ID}:${r.round}:spin`);
        let x = rand() * total;
        winner = wheel[wheel.length - 1].id;
        for (const s of wheel) { if ((x -= s.w) < 0) { winner = s.id; break; } }
      }
      Object.assign(n, { phase: 'roulette', phaseEnds: ends('roulette'), wheel, winner, direct });
    } else if (from === 'roulette') {
      Object.assign(n, { phase: 'result', phaseEnds: null });
    } else if (from === 'result') {
      Object.assign(n, { phase: 'lobby', round: (r.round || 1) + 1, phaseEnds: null, roster: null,
        mood: null, hearts: null, veto: null, pick: null, cats: null, vetoCats: null, finalCats: null, cands: null, wheel: null, winner: null, direct: null });
    }
    return n;
  }

  async function advance(from) {
    if (busy || !room) return;
    busy = true;
    const step = room.step || 0;
    let committedRoom = null;
    try {
      const ok = await store.transaction(RP, (cur) => {
        if (!cur || (cur.step || 0) !== step || cur.phase !== from) return undefined;
        committedRoom = transition(cur, from);
        return committedRoom;
      });
      if (ok && from === 'roulette' && committedRoom) {
        const w = (committedRoom.cands || []).find((c) => c.id === committedRoom.winner);
        if (w) await store.set(`history/${TODAY}`, { id: w.id, name: w.name, cat: w.cat, round: committedRoom.round || 1, room: ROOM_ID });
      }
    } catch (e) { console.error(e); } finally { busy = false; }
  }

  // ---------- 행동 ----------
  async function ensureRoom() {
    await store.transaction(RP, (cur) => (cur ? undefined : { step: 0, round: 1, phase: 'lobby', created: store.now() }));
  }
  async function join() {
    if (!room || !me.name) return;
    const p = room.players && room.players[me.id];
    if (p && p.name === me.name && p.emoji === me.emoji) return;
    await store.update(`${RP}/players/${me.id}`, { name: me.name, emoji: me.emoji, t: p ? p.t : store.now() });
  }
  async function vote(kind, value) { if (!roster().includes(me.id)) return; await store.set(`${RP}/${kind}/${me.id}`, value); }

  // 봇(테스트용): 참가자 중 첫 번째 사람 폰이 봇 투표를 대신 넣음
  function runBots() {
    if (!room || !PHASE_MS[room.phase] || room.phase === 'roulette') return;
    const humans = roster().filter((id) => !isBot(id));
    if (!humans.length || humans[0] !== me.id) return;
    const start = room.phaseEnds - PHASE_MS[room.phase];
    for (const bid of roster().filter(isBot)) {
      if (hasVoted(room, bid)) continue;
      const delay = 1200 + (hash(bid + room.phase + room.round) % 3500);
      if (store.now() - start < delay) continue;
      const r = rng(bid + room.phase + room.round + ROOM_ID);
      if (room.phase === 'mood') store.set(`${RP}/mood/${bid}`, MOODS[Math.floor(r() * MOODS.length)].k);
      if (room.phase === 'hearts') { const h = {}; for (let i = 0; i < HEARTS; i++) { const c = room.cats[Math.floor(r() * room.cats.length)]; h[c] = (h[c] || 0) + 1; } store.set(`${RP}/hearts/${bid}`, h); }
      if (room.phase === 'veto') store.set(`${RP}/veto/${bid}`, r() < 0.6 ? 'none' : room.vetoCats[Math.floor(r() * room.vetoCats.length)]);
      if (room.phase === 'pick') store.set(`${RP}/pick/${bid}`, room.cands[Math.floor(r() * room.cands.length)].id);
    }
  }

  // ---------- 공유 ----------
  const baseUrl = () => location.origin + location.pathname;
  let kakaoShareReady = null;
  async function kakaoShare(text, btn) {
    if (!CFG.KAKAO_JS_KEY) return false;
    try {
      if (!kakaoShareReady) kakaoShareReady = loadScript('https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js').then(() => { if (!window.Kakao.isInitialized()) window.Kakao.init(CFG.KAKAO_JS_KEY); });
      await kakaoShareReady;
      window.Kakao.Share.sendDefault({ objectType: 'text', text: `${text}\n\n👉 ${baseUrl()}`, link: { mobileWebUrl: baseUrl(), webUrl: baseUrl() }, buttonTitle: btn });
      return true;
    } catch (e) { console.warn(e); return false; }
  }
  async function share(text, btn) {
    if (await kakaoShare(text, btn)) return;
    const full = `${text}\n${baseUrl()}`;
    if (navigator.share) { try { await navigator.share({ text: full }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(full); toast('복사됐어요! 단톡방에 붙여넣기 해주세요 📋'); } catch { prompt('아래 내용을 복사해 단톡방에 붙여넣어 주세요', full); }
  }
  const mapUrl = (r) => (r.kakaoId ? `https://place.map.kakao.com/${r.kakaoId}` : `https://map.kakao.com/link/search/${encodeURIComponent((r.addr ? '' : '포천 ') + r.name)}`);

  // ---------- 카카오맵 자동 수집 (추천·신규 맛집) ----------
  function mapCat(cn) {
    const s = cn || '';
    if (/술집|호프|카페|간식|제과|베이커리|디저트|아이스크림|떡/.test(s)) return null;
    if (/해장국|국밥|순대|곰탕|설렁탕|감자탕|추어|육개장|국수.*곰|삼계탕|갈비탕/.test(s)) return '국밥·탕';
    if (/찌개|전골|부대|동태|매운탕|해물탕/.test(s)) return '찌개·전골';
    if (/중식|중국/.test(s)) return '중식';
    if (/돈까스|일식|초밥|라멘|우동|돈가스|회/.test(s)) return '돈까스·일식';
    if (/국수|냉면|칼국수|막국수|면/.test(s)) return '면·국수';
    if (/분식|김밥|떡볶이/.test(s)) return '분식';
    if (/치킨|패스트푸드|햄버거|피자/.test(s)) return '치킨·버거';
    if (/고기|삼겹|갈비|육류|두루치기|곱창|오리|닭갈비|족발|보쌈/.test(s)) return '고기·구이';
    if (/양식|이탈리|아시아|베트남|태국|인도|멕시칸|퓨전/.test(s)) return '양식·기타';
    if (/한식|백반|기사식당|뷔페/.test(s)) return '한식·백반';
    return '양식·기타';
  }
  const estMin = (meters) => Math.round((meters / 1000) * 1.5 + 2); // 지방도로 기준 대략 추정
  const tagsFor = (cat, cn) => {
    const t = [];
    if (/국밥|탕|찌개|전골|국수/.test(cat)) t.push('soup');
    if (/고기|국밥|돈까스|백반|중식|찌개|치킨/.test(cat)) t.push('hearty');
    if (/면|분식|백반/.test(cat)) t.push('light');
    if (/찌개|중식|짬뽕|매운|두루치기|닭갈비|육개장/.test(cat + cn)) t.push('spicy');
    return t;
  };
  async function discover(manual = false) {
    if (!CFG.KAKAO_JS_KEY) { if (manual) toast('config.js에 KAKAO_JS_KEY를 넣어야 사용할 수 있어요'); return; }
    try {
      if (!(window.kakao && window.kakao.maps && window.kakao.maps.services)) {
        await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(CFG.KAKAO_JS_KEY)}&libraries=services&autoload=false`);
        await new Promise((r) => window.kakao.maps.load(r));
      }
      const M = window.kakao.maps; const S = M.services;
      const geo = new S.Geocoder(); const ps = new S.Places();
      const g = await new Promise((r) => geo.addressSearch(CFG.COMPANY_ADDRESS, (d, s) => r(s === S.Status.OK ? d[0] : null)));
      if (!g) throw new Error('회사 주소 좌표 변환 실패');
      const center = new M.LatLng(g.y, g.x);
      const radius = Math.round(((MAX_MIN - 2) / 1.5) * 1000);
      const found = {};
      for (let page = 1; page <= 3; page++) {
        const list = await new Promise((r) => ps.categorySearch('FD6', (d, s) => r(s === S.Status.OK ? d : []), { location: center, radius, page, sort: S.SortBy.ACCURACY }));
        for (const p of list) {
          const cat = mapCat(p.category_name);
          const min = estMin(+p.distance);
          if (!cat || min > MAX_MIN) continue;
          const id = 'k' + p.id;
          found[id] = { id, name: p.place_name, cat, menu: (p.category_name || '').split('>').pop().trim(), tags: tagsFor(cat, p.category_name), min, kakaoId: p.id, addr: p.road_address_name || p.address_name };
        }
        if (list.length < 15) break;
      }
      // 단골·추천 식당 위치/거리 보강
      const kakaoInfo = {};
      for (const r of [...DATA.favorites, ...DATA.recommended, ...Object.values(rdb.custom || {})]) {
        const list = await new Promise((res) => ps.keywordSearch(r.name, (d, s) => res(s === S.Status.OK ? d : []), { location: center, radius: 20000, sort: S.SortBy.DISTANCE }));
        const hit = list.find((p) => norm(p.place_name).includes(norm(r.name).slice(0, 4))) || null;
        if (hit) kakaoInfo[r.id] = { kakaoId: hit.id, min: estMin(+hit.distance), addr: hit.road_address_name || hit.address_name };
      }
      await store.update('restaurants', { discovered: found, kakao: kakaoInfo, discoveredAt: TODAY });
      if (manual) toast(`카카오맵에서 ${Object.keys(found).length}곳을 불러왔어요 🗺️`);
    } catch (e) {
      console.warn(e);
      if (manual) toast('카카오맵 불러오기 실패: 키와 사이트 도메인 등록을 확인해주세요');
    }
  }

  // ---------- 렌더링 ----------
  const catIc = (c) => CATS[c] || '🍽️';
  const srcBadge = (r) => (r.src === 'fav' ? '<span class="badge">⭐ 단골</span>' : r.src === 'kakao' ? '<span class="badge new">🆕 카카오맵</span>' : r.src === 'web' ? '<span class="badge web">👍 추천</span>' : r.src === 'custom' ? '<span class="badge">➕ 직접추가</span>' : '');
  const minTxt = (r) => (r.min ? `🚗 약 ${r.min}분` : '');

  function header() {
    return `<div class="top"><div class="brand">🍱 JM 런치 배틀</div>
      ${me.name ? `<button class="me-chip" data-a="profile">${esc(me.emoji)} ${esc(me.name)}</button>` : ''}</div>`;
  }
  function playerGrid(ids, showDone) {
    const cells = [];
    for (let i = 0; i < MAX; i++) {
      const id = ids[i];
      if (!id) { cells.push('<div class="player"><div class="avatar empty">＋</div><div class="pname">&nbsp;</div></div>'); continue; }
      const p = playerOf(id);
      const done = showDone && room && hasVoted(room, id);
      cells.push(`<div class="player"><div class="avatar ${done ? 'done' : ''} ${id === me.id ? 'me' : ''}">${esc(p.emoji)}</div><div class="pname">${esc(p.name)}</div></div>`);
    }
    return `<div class="players">${cells.join('')}</div>`;
  }
  function timerBar(title) {
    return `<div class="step">STEP ${STEPS[room.phase]} / 5 · ${title}</div>
      <div class="timer"><i id="tbar"></i></div>
      <div class="timer-row"><span id="tsec"></span><span>${roster().filter((id) => hasVoted(room, id)).length}/${roster().length}명 완료</span></div>`;
  }

  function vProfile() {
    return `${header()}
      <h1>오늘 점심, 같이 정해요 🍚</h1>
      <p class="sub">${esc(CFG.COMPANY_NAME || '')} 점심 메뉴 결정 게임 · 차로 ${MAX_MIN}분 이내 식당 중에서 골라요</p>
      <div class="card">
        <label class="lbl">닉네임</label>
        <input id="nm" maxlength="8" placeholder="예: 김대리" value="${esc(me.name)}" />
        <label class="lbl">내 캐릭터</label>
        <div class="emojis">${EMOJIS.map((e) => `<button data-a="emoji" data-v="${e}" class="${e === me.emoji ? 'on' : ''}">${e}</button>`).join('')}</div>
        <button class="btn" data-a="saveProfile">입장하기</button>
      </div>`;
  }

  function vLobby() {
    const act = activePlayers();
    const spect = playersSorted().slice(MAX);
    const inRoom = !!(room.players && room.players[me.id]);
    const isSpect = spect.some((p) => p.id === me.id);
    const last = history[TODAY];
    return `${header()}
      <h1>오늘의 점심 대기실</h1>
      <p class="sub">${TODAY.slice(5).replace('-', '월 ')}일 · ${room.round > 1 ? `${room.round}번째 판 · ` : ''}최대 ${MAX}명 (차 1대)</p>
      <div class="card">
        ${playerGrid(act.map((p) => p.id), false)}
        ${spect.length ? `<div class="spectators">🚶 대기/관전: ${spect.map((p) => esc(p.emoji + p.name)).join(', ')}</div>` : ''}
        ${isSpect ? '<p class="sub" style="margin:8px 0 0">자리가 꽉 찼어요. 이번 판은 관전으로 참여해요.</p>' : ''}
        <button class="btn" data-a="start" ${act.length ? '' : 'disabled'}>${act.length}명으로 게임 시작 ▶</button>
        <div class="row" style="margin-top:2px">
          <button class="btn kakao" data-a="invite">💬 카톡 초대</button>
          <button class="btn ghost" data-a="copyLink">🔗 링크 복사</button>
        </div>
        <div class="row" style="margin-top:2px">
          ${inRoom ? '<button class="btn ghost" data-a="leave">오늘은 빠질게요</button>' : '<button class="btn ghost" data-a="rejoin">다시 참여</button>'}
        </div>
      </div>
      ${last ? `<div class="card"><div class="meta">오늘 1차 결과</div><div class="nm" style="font-weight:800;margin-top:4px">${catIc(last.cat)} ${esc(last.name)}</div></div>` : ''}
      <div class="card">
        <div class="meta" style="margin-top:0">📋 게임 방법</div>
        <div class="tally">① 오늘 컨디션 고르기 → ② 하트 ${HEARTS}개로 메뉴 투표 → ③ 거부권 1장 (안 쓰면 룰렛 가산점!) → ④ 식당 투표 → ⑤ 룰렛으로 최종 결정</div>
      </div>
      <div class="center">
        <button class="link" data-a="manage">🍽️ 식당 관리 (${pool().length}곳)</button>
        <button class="link" data-a="bot">🤖 테스트 봇 추가</button>
      </div>`;
  }

  function vMood() {
    const mine = room.mood && room.mood[me.id];
    return `${header()}${timerBar('오늘의 컨디션')}
      <h2>오늘 어떤 게 땡겨요?</h2><p class="sub">하나만 골라주세요. 다 같이 고른 결과로 메뉴 후보가 정해져요.</p>
      ${playerGrid(roster(), true)}
      <div class="grid2" style="margin-top:12px">${MOODS.map((m) => `<button class="opt ${mine === m.k ? 'on' : ''}" data-a="mood" data-v="${m.k}" ${canVote() ? '' : 'disabled'}><span class="ic">${m.ic}</span>${m.t}</button>`).join('')}</div>`;
  }

  let myHearts = {};
  function vHearts() {
    const server = (room.hearts && room.hearts[me.id]) || {};
    if (heartSum(server) >= heartSum(myHearts)) myHearts = { ...server };
    const left = HEARTS - heartSum(myHearts);
    const counts = {};
    for (const c of room.cats || []) counts[c] = pool().filter((r) => r.cat === c).length;
    return `${header()}${timerBar('하트 투표')}
      <h2>먹고 싶은 메뉴에 하트!</h2><p class="sub">하트 ${HEARTS}개를 나눠 주세요. 한 곳에 몰아줘도 돼요.</p>
      <div class="left">${'❤️'.repeat(left)}${'🤍'.repeat(HEARTS - left)}</div>
      <div class="grid2">${(room.cats || []).map((c) => `<button class="opt ${myHearts[c] ? 'on' : ''}" data-a="heart" data-v="${esc(c)}" ${canVote() ? '' : 'disabled'}>
        ${myHearts[c] ? `<span class="hearts">${'❤️'.repeat(myHearts[c])}</span><span class="minus" data-a="unheart" data-v="${esc(c)}">−</span>` : ''}
        <span class="ic">${catIc(c)}</span>${esc(c)}<small>${counts[c]}곳</small></button>`).join('')}</div>
      ${playerGrid(roster(), true)}`;
  }

  function vVeto() {
    const mine = room.veto && room.veto[me.id];
    const ht = heartTally(room);
    return `${header()}${timerBar('거부권')}
      <h2>이건 진짜 안 돼! 🙅</h2><p class="sub">거부권은 1장. 안 쓰고 양보하면 룰렛에서 내 표가 <b>1.5배</b>가 돼요.</p>
      <div class="grid2">${(room.vetoCats || []).map((c) => `<button class="opt ${mine === c ? 'no' : ''}" data-a="veto" data-v="${esc(c)}" ${canVote() ? '' : 'disabled'}><span class="ic">${catIc(c)}</span>${esc(c)}<small>❤️ ${ht[c] || 0}</small></button>`).join('')}</div>
      <button class="btn ${mine === 'none' ? '' : 'ghost'}" data-a="veto" data-v="none" ${canVote() ? '' : 'disabled'}>😇 다 괜찮아요 (양보하기)</button>
      ${playerGrid(roster(), true)}`;
  }

  function vPick() {
    const mine = room.pick && room.pick[me.id];
    const vetoed = Object.keys(vetoTally(room));
    return `${header()}${timerBar('식당 투표')}
      <h2>어디로 갈까요? 🚗</h2>
      <p class="sub">${(room.finalCats || []).map((c) => catIc(c) + ' ' + esc(c)).join(' · ')} 중에서 골랐어요.${vetoed.length ? ` (🚫 ${vetoed.map(esc).join(', ')} 제외)` : ''}</p>
      ${(room.cands || []).map((r) => `<button class="opt rest ${mine === r.id ? 'on' : ''}" style="width:100%;margin-bottom:10px" data-a="pick" data-v="${esc(r.id)}" ${canVote() ? '' : 'disabled'}>
        <span class="ic">${catIc(r.cat)}</span><span><div class="nm">${esc(r.name)}</div><div class="meta">${srcBadge(r)}${esc(r.menu)} ${minTxt(r)}</div></span></button>`).join('')}
      ${playerGrid(roster(), true)}`;
  }

  function vRoulette() {
    const wheel = room.wheel || [];
    const total = wheel.reduce((a, b) => a + b.w, 0) || 1;
    let acc = 0;
    const segs = wheel.map((s, i) => { const from = (acc / total) * 360; acc += s.w; const to = (acc / total) * 360; return { ...s, from, to, color: WHEEL_COLORS[i % WHEEL_COLORS.length] }; });
    const grad = segs.map((s) => `${s.color} ${s.from}deg ${s.to}deg`).join(',');
    const name = (id) => ((room.cands || []).find((c) => c.id === id) || {}).name || '';
    const labels = segs.map((s) => { const mid = (s.from + s.to) / 2 - 90; return `<div class="lb" style="transform:rotate(${mid}deg)">${esc(name(s.id))}</div>`; }).join('');
    return `${header()}<div class="step">STEP 5 / 5 · 최종 룰렛</div>
      <h2 class="center" style="margin-top:8px">${room.direct ? '압도적 득표! 바로 확정 🎉' : '두구두구두구… 🥁'}</h2>
      <div class="wheel-wrap"><div class="pointer">🔻</div><div class="wheel" id="wheel" style="background:conic-gradient(${grad})">${labels}</div></div>
      <div class="tally center">${segs.map((s) => `<span style="color:${s.color}">●</span> ${esc(name(s.id))} ${Math.round((s.w / total) * 100)}%`).join(' &nbsp; ')}</div>
      <p class="sub center" style="margin-top:8px">양보한 사람의 표는 1.5배로 계산돼요</p>`;
  }

  function spinWheel() {
    const el = $('#wheel'); if (!el || !room.wheel) return;
    const key = `${ROOM_ID}:${room.round}:${room.step}`;
    const total = room.wheel.reduce((a, b) => a + b.w, 0) || 1;
    let acc = 0; let mid = 0;
    for (const s of room.wheel) { const from = (acc / total) * 360; acc += s.w; const to = (acc / total) * 360; if (s.id === room.winner) { const r = rng(key + 'jitter'); mid = from + (to - from) * (0.25 + r() * 0.5); } }
    const target = 360 * 6 - mid;
    const elapsed = store.now() - (room.phaseEnds - PHASE_MS.roulette);
    if (spunKey === key) { el.style.transition = 'none'; el.style.transform = `rotate(${target}deg)`; return; }
    spunKey = key;
    if (elapsed > 5000) { el.style.transition = 'none'; el.style.transform = `rotate(${target}deg)`; return; }
    el.style.transitionDuration = `${Math.max(1.2, 5 - elapsed / 1000)}s`;
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = `rotate(${target}deg)`; }));
  }

  function vResult() {
    const w = (room.cands || []).find((c) => c.id === room.winner);
    if (!w) return vLobby();
    const pickers = Object.entries(room.pick || {}).filter(([, v]) => v === w.id).map(([pid]) => playerOf(pid).emoji).join(' ');
    const yielders = Object.entries(room.veto || {}).filter(([, v]) => v === 'none').map(([pid]) => playerOf(pid).emoji + playerOf(pid).name);
    return `${header()}
      <div class="card result">
        <div class="meta">오늘의 점심은</div>
        <div class="big">${catIc(w.cat)}</div>
        <div class="nm">${esc(w.name)}</div>
        <div class="meta">${srcBadge(w)}${esc(w.menu)} ${minTxt(w)}</div>
        ${w.addr ? `<div class="meta">📍 ${esc(w.addr)}</div>` : ''}${w.note ? `<div class="meta">ℹ️ ${esc(w.note)}</div>` : ''}
        ${pickers ? `<div class="meta" style="margin-top:10px">이 식당에 투표: ${esc(pickers)}</div>` : ''}
      </div>
      <a class="btn" style="text-align:center;text-decoration:none" href="${mapUrl(w)}" target="_blank" rel="noopener">🗺️ 카카오맵 길찾기</a>
      <button class="btn kakao" data-a="shareResult">💬 단톡방에 결과 공유</button>
      <button class="btn ghost" data-a="again">🔄 한 판 더 (오늘 결과 덮어쓰기)</button>
      ${yielders.length ? `<p class="sub center" style="margin-top:14px">😇 오늘의 양보왕: ${esc(yielders.join(', '))}</p>` : ''}`;
  }

  function vManage() {
    const all = pool({ includeDisabled: true });
    const dis = rdb.disabled || {};
    const groups = [['fav', '⭐ 우리 회사 단골'], ['custom', '➕ 직접 추가'], ['web', '👍 가산면 추천 (웹 검색)'], ['kakao', `🆕 카카오맵 ${MAX_MIN}분 반경`]];
    const recent = Object.entries(history || {}).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 7);
    return `${header()}
      <button class="link" data-a="back" style="padding-left:0">← 대기실로</button>
      <h1>식당 관리</h1><p class="sub">끄면 게임 후보에서 빠져요. 최근 7일 안에 간 식당은 자동으로 제외돼요.</p>
      <div class="card">
        <div class="section-t" style="margin-top:0">식당 직접 추가</div>
        <input id="rname" placeholder="식당 이름" maxlength="30" />
        <div class="row" style="margin-top:8px">
          <select id="rcat">${Object.keys(CATS).map((c) => `<option>${esc(c)}</option>`).join('')}</select>
          <input id="rmenu" placeholder="대표 메뉴" maxlength="20" />
        </div>
        <button class="btn" data-a="addRest">추가하기</button>
      </div>
      <div class="card">
        <div class="section-t" style="margin-top:0">🗺️ 카카오맵 추천·신규 맛집</div>
        <p class="sub" style="margin:0">${CFG.KAKAO_JS_KEY ? `마지막 갱신: ${esc(rdb.discoveredAt || '없음')} (7일마다 자동 갱신)` : 'config.js에 카카오 JavaScript 키를 넣으면 회사 기준 차로 ' + MAX_MIN + '분 반경 식당을 자동으로 불러와요.'}</p>
        <button class="btn ghost" data-a="discover" ${CFG.KAKAO_JS_KEY ? '' : 'disabled'}>지금 불러오기</button>
      </div>
      <div class="card list">
        ${groups.map(([src, title]) => { const rs = all.filter((r) => r.src === src); if (!rs.length) return ''; return `<div class="section-t">${title} (${rs.length})</div>` + rs.map((r) => `
          <div class="item"><span style="font-size:22px">${catIc(r.cat)}</span>
            <div class="grow"><div class="nm">${esc(r.name)}</div><div class="meta">${esc(r.cat)} · ${esc(r.menu || '')} ${minTxt(r)}</div></div>
            ${src === 'custom' ? `<button class="btn ghost small" data-a="delRest" data-v="${esc(r.id)}">삭제</button>` : ''}
            <button class="toggle ${dis[r.id] ? '' : 'on'}" data-a="toggleRest" data-v="${esc(r.id)}" aria-label="사용"></button></div>`).join(''); }).join('')}
      </div>
      <div class="card list">
        <div class="section-t" style="margin-top:0">📅 최근 7일 결과</div>
        ${recent.length ? recent.map(([d, h]) => `<div class="item"><div class="grow"><div class="nm">${esc(h.name)}</div><div class="meta">${esc(d)}</div></div>${d === TODAY ? '<button class="btn ghost small" data-a="clearToday">기록 취소</button>' : ''}</div>`).join('') : '<p class="sub" style="margin:6px 0 0">아직 기록이 없어요.</p>'}
      </div>`;
  }

  const canVote = () => roster().includes(me.id);

  function render(force = false) {
    if (!store) return;
    let html; let key;
    if (!me.name || screen === 'profile') { key = 'profile'; html = vProfile(); }
    else if (screen === 'manage') { key = 'manage:' + JSON.stringify([rdb, history]); html = vManage(); }
    else if (!room) { key = 'loading'; html = '<div class="loading">방 준비 중…</div>'; }
    else {
      const ph = room.phase;
      // 룰렛이 도는 동안에는 다시 그리지 않음 (애니메이션 유지)
      key = ph === 'roulette' ? `roulette:${room.round}:${room.step}` : JSON.stringify(room) + JSON.stringify(history) + (rdb.discoveredAt || '');
      html = ph === 'mood' ? vMood() : ph === 'hearts' ? vHearts() : ph === 'veto' ? vVeto() : ph === 'pick' ? vPick() : ph === 'roulette' ? vRoulette() : ph === 'result' ? vResult() : vLobby();
      if (ph !== 'lobby' && ph !== 'result' && !canVote()) html = '<div class="banner" style="border-radius:12px;margin-bottom:10px">👀 이번 판은 관전 중이에요 (다음 판에 참여할 수 있어요)</div>' + html;
    }
    if (!force && key === lastRenderKey) return;
    lastRenderKey = key;
    const prevResult = app.dataset.phase;
    app.innerHTML = html;
    app.dataset.phase = room ? room.phase : '';
    if (room && room.phase === 'roulette' && screen === 'game') spinWheel();
    if (room && room.phase === 'result' && prevResult === 'roulette') { confetti(); try { navigator.vibrate && navigator.vibrate([80, 50, 160]); } catch { /* noop */ } }
    tick();
  }

  function confetti() {
    const box = document.createElement('div'); box.className = 'confetti';
    for (let i = 0; i < 60; i++) { const c = document.createElement('i'); c.style.left = Math.random() * 100 + 'vw'; c.style.background = WHEEL_COLORS[i % 5]; c.style.animationDelay = Math.random() * 0.6 + 's'; box.appendChild(c); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 3500);
  }

  function tick() {
    if (!room || !store) return;
    const ph = room.phase;
    if (PHASE_MS[ph] && room.phaseEnds) {
      const left = Math.max(0, room.phaseEnds - store.now());
      const bar = $('#tbar'); const sec = $('#tsec');
      if (bar) bar.style.width = (left / PHASE_MS[ph]) * 100 + '%';
      if (sec) sec.textContent = `⏱ ${Math.ceil(left / 1000)}초`;
      const timeUp = left <= 0;
      if (timeUp || (ph !== 'roulette' && allVoted(room))) {
        // 참가자 폰이 우선 진행, 응답 없으면 2초 뒤 누구나 진행
        if (canVote() || store.now() > room.phaseEnds + 2000) advance(ph);
      }
      runBots();
    }
  }

  // ---------- 이벤트 ----------
  app.addEventListener('input', (e) => { if (e.target.id === 'nm') me.name = e.target.value.trim(); });
  app.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-a]'); if (!el) return;
    const a = el.dataset.a; const v = el.dataset.v;
    if (a === 'emoji') { me.emoji = v; app.querySelectorAll('.emojis button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); return; }
    if (a === 'saveProfile') {
      const n = ($('#nm').value || '').trim();
      if (!n) { toast('닉네임을 입력해주세요'); return; }
      me.name = n; saveMe(); screen = 'game'; render(true); await join(); return;
    }
    if (a === 'profile') { if (!room || room.phase === 'lobby' || room.phase === 'result') { screen = 'profile'; render(true); } return; }
    if (a === 'manage') { screen = 'manage'; render(true); return; }
    if (a === 'back') { screen = 'game'; render(true); return; }
    if (a === 'start') { await advance('lobby'); return; }
    if (a === 'again') { await advance('result'); return; }
    if (a === 'leave') { await store.set(`${RP}/players/${me.id}`, null); return; }
    if (a === 'rejoin') { await join(); return; }
    if (a === 'copyLink') {
      const t = `🍱 오늘 점심 정하자! JM 런치 배틀\n${baseUrl()}`;
      try { await navigator.clipboard.writeText(t); toast('링크 복사 완료! 단톡방에 붙여넣기 해주세요 📋'); } catch { prompt('아래 내용을 복사해 단톡방에 붙여넣어 주세요', t); }
      return;
    }
    if (a === 'invite') { await share(`🍱 오늘 점심 뭐 먹지? JM 런치 배틀 시작!\n링크 누르고 들어와 주세요 (최대 ${MAX}명)`, '게임 참여하기'); return; }
    if (a === 'shareResult') {
      const w = (room.cands || []).find((c) => c.id === room.winner);
      if (w) await share(`🎉 오늘 점심은 [${w.name}]!\n${catIc(w.cat)} ${w.menu}${w.min ? ` · 차로 약 ${w.min}분` : ''}\n🗺️ ${mapUrl(w)}`, '결과 보기');
      return;
    }
    if (a === 'bot') {
      if (activePlayers().length >= MAX) { toast('자리가 꽉 찼어요'); return; }
      const n = Object.keys(room.players || {}).filter(isBot).length + 1;
      await store.update(`${RP}/players/bot_${n}_${Math.random().toString(36).slice(2, 6)}`, { name: `봇${n}`, emoji: '🤖', t: store.now() });
      return;
    }
    if (a === 'mood') { await vote('mood', v); return; }
    if (a === 'unheart') { e.stopPropagation(); if (myHearts[v]) { myHearts[v]--; if (!myHearts[v]) delete myHearts[v]; await vote('hearts', { ...myHearts }); lastRenderKey = ''; render(); } return; }
    if (a === 'heart') {
      if (heartSum(myHearts) >= HEARTS) { toast('하트를 다 썼어요. − 버튼으로 회수할 수 있어요'); return; }
      myHearts[v] = (myHearts[v] || 0) + 1; await vote('hearts', { ...myHearts }); return;
    }
    if (a === 'veto') { await vote('veto', v); return; }
    if (a === 'pick') { await vote('pick', v); return; }
    if (a === 'addRest') {
      const name = ($('#rname').value || '').trim(); if (!name) { toast('식당 이름을 입력해주세요'); return; }
      const cat = $('#rcat').value; const menu = ($('#rmenu').value || '').trim();
      const id = 'c' + hash(name + Date.now()).toString(36);
      await store.set(`restaurants/custom/${id}`, { id, name, cat, menu, tags: tagsFor(cat, menu) });
      toast(`${name} 추가 완료!`); return;
    }
    if (a === 'delRest') { await store.set(`restaurants/custom/${v}`, null); return; }
    if (a === 'toggleRest') { await store.set(`restaurants/disabled/${v}`, (rdb.disabled || {})[v] ? null : true); return; }
    if (a === 'discover') { toast('카카오맵에서 불러오는 중…'); await discover(true); return; }
    if (a === 'clearToday') { await store.set(`history/${TODAY}`, null); return; }
  });

  // 하트 투표 단계가 바뀌면 로컬 하트 초기화
  let lastPhaseKey = '';
  function onRoom(r) {
    room = r;
    const pk = r ? `${r.round}:${r.phase}` : '';
    if (pk !== lastPhaseKey) { lastPhaseKey = pk; myHearts = {}; }
    if (r && me.name && r.phase === 'lobby' && !(r.players && r.players[me.id]) && !onRoom.left) join();
    render();
  }

  // ---------- 시작 ----------
  async function boot() {
    const banner = $('#banner');
    try {
      if (CFG.FIREBASE) {
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js');
        store = FirebaseStore(CFG.FIREBASE);
      }
    } catch (e) { console.error(e); store = null; }
    if (!store) {
      store = LocalStore();
      banner.hidden = false;
      banner.innerHTML = '🧪 <b>체험 모드</b> · 이 기기 안에서만 동기화돼요. 여러 폰으로 하려면 config.js에 Firebase를 설정해주세요. (봇으로 테스트 가능)';
    }
    store.on('history', (h) => { history = h || {}; render(); });
    store.on('restaurants', (d) => { rdb = d || {}; render(); });
    store.on(RP, onRoom);
    await ensureRoom();
    // 나가기 누른 사람은 자동 재입장하지 않도록
    app.addEventListener('click', (e) => { const el = e.target.closest('[data-a]'); if (!el) return; if (el.dataset.a === 'leave') onRoom.left = true; if (el.dataset.a === 'rejoin' || el.dataset.a === 'saveProfile') onRoom.left = false; }, true);
    setInterval(tick, 250);
    // 카카오 자동 수집 (7일마다)
    setTimeout(async () => {
      if (!CFG.KAKAO_JS_KEY) return;
      const at = await store.get('restaurants/discoveredAt');
      if (!at || at < seoulDate(-7)) discover(false);
    }, 1500);
  }
  boot();
})();
