// 수업 관리 화면(출석 체크, 출석 기록, 과제 확인, 학생 등록)의 동작. _layouts/class.html이 화면마다 싣고, .att의 data-att-view로 그 화면만 그린다.
// 수업 설정과 수강생 명단은 레이아웃이 넣은 #att-data에서 읽는다(lecture/04-deploy/class.yml, _private/roster.yml).
// 출석, 과제, 등록, 저장소는 이 브라우저(localStorage)에만 저장한다. 처음 동작은 TestClass의 출석부 v4다.
(() => {
const root = document.querySelector(".att");
if (!root) return;
const VIEW = root.dataset.attView;

// ═════════ 설정: 수업 설정과 수강생 명단 ═════════
let DATA = {};
try { DATA = JSON.parse(document.getElementById("att-data").textContent) || {}; } catch {}
const CLS = DATA.class || {};
const ROSTER = Array.isArray(DATA.roster) ? DATA.roster : [];
// 등록 댓글을 받는 저장소와 이슈 번호. 강사가 과제 확인 화면에서 넣은 값이 있으면 그 브라우저에서는 그 값을 쓴다
const CONFIG = { home: CLS.register_repo || "", issue: +CLS.register_issue || 0 };
const KEY = "class." + (CLS.name || "default") + ".";          // 이 브라우저의 저장소 이름. 수업마다 따로 둔다

const START = (() => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(CLS.start || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(); })();
const SESSIONS = Math.max(1, +CLS.sessions || 1);
const SECTIONS = Array.isArray(CLS.sections) ? CLS.sections.map(String) : [];
const TASKS = (Array.isArray(CLS.tasks) ? CLS.tasks : []).map(t => ({ name: String(t.name || ""), session: Math.min(SESSIONS - 1, Math.max(0, (+t.session || 1) - 1)) }));
// 오늘 회차: 날짜가 오늘을 지나지 않은 마지막 회차
const TODAY = (() => { const now = new Date(); let i = 0; for (let k = 0; k < SESSIONS; k++) { const d = new Date(START); d.setDate(d.getDate() + 7 * k); if (d <= now) i = k; } return i; })();
const ATT = { P: { name: "출석", mark: "✓" }, L: { name: "지각", mark: "지" }, A: { name: "결석", mark: "결" }, E: { name: "공결", mark: "공" }, U: { name: "미체크", mark: "–" } };
const ATT_PILL = { P: "ok", L: "late", A: "absent", E: "excused", U: "" };
const ORDER = ["P", "L", "A", "E"];
const NEXT = { U: "P", P: "L", L: "A", A: "E", E: "P" };
const SUB = { U: { name: "미확인", mark: "–", next: "Y", pill: "" }, Y: { name: "제출", mark: "제출", next: "T", pill: "ok" }, T: { name: "늦게 제출", mark: "늦게", next: "N", pill: "late" },
              N: { name: "미제출", mark: "미제출", next: "X", pill: "absent" }, X: { name: "면제", mark: "면제", next: "Y", pill: "excused" } };
const PLACEHOLDER = { L: "몇 분 늦었나요", A: "결석 사유", E: "공결 사유 · 증빙" };

const students = ROSTER.map((r, id) => ({
  id, no: String(r.number || ""), name: String(r.name || r.number || ""), sec: String(r.section || ""),
  att: Array(SESSIONS).fill("U"), sub: TASKS.map(() => "U"), notes: {},
  subSrc: TASKS.map(() => "none"),                    // none(아직 읽지 않음) · gh(GitHub) · manual(강사가 고침)
  ghTask: [], repo: "", pages: "", ghUser: "", repoSrc: "", gh: { status: "none", commits: [], pushed: new Set() },
}));

const state = { tab: VIEW, session: Math.min(SESSIONS - 1, Math.max(0, +(new URLSearchParams(location.search).get("session") ?? TODAY) || 0)), statusFilter: null, task: null, editRepos: false,
                done: Array.from({ length: SESSIONS }, () => false), doneAt: {} };

// ═════════ 도우미 ═════════
const $ = id => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const dateOf = i => { const d = new Date(START); d.setDate(d.getDate() + 7 * i); return d; };
const dayStart = i => { const d = dateOf(i); d.setHours(0, 0, 0, 0); return d; };
const dayEnd = i => { const d = dateOf(i); d.setHours(23, 59, 59, 999); return d; };
const short = d => `${d.getMonth() + 1}/${d.getDate()}`;
const hhmm = d => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const long = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${"일월화수목금토"[d.getDay()]})`;
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// 확인 필요의 기준: 출석 체크 화면의 입력에서 읽고, 다른 화면에서는 저장해 둔 값을 쓴다
const rules = () => {
  if ($("ruleAbs") && $("ruleStreak")) return { abs: +$("ruleAbs").value || 1, streak: +$("ruleStreak").value || 1 };
  try { const r = JSON.parse(store.get(KEY + "rules")); if (r && r.abs && r.streak) return r; } catch {}
  return { abs: 2, streak: 2 };
};
const filterBy = (q, sec) => students.filter(s => (!q || s.name.includes(q) || s.no.includes(q.toUpperCase())) && (!sec || s.sec === sec));
const pill = (cls, text, title) => `<span class="pill ${cls}"${title ? ` title="${esc(title)}"` : ""}>${esc(text)}</span>`;
const link = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`;

// 저장: 가능하면 localStorage, 막힌 환경(data: 주소, 사생활 모드)에서는 메모리에만
const memStore = {}; let persistent = true;
try { localStorage.setItem(KEY + "probe", "1"); localStorage.removeItem(KEY + "probe"); } catch { persistent = false; }
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return k in memStore ? memStore[k] : null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { memStore[k] = v; } },
};

function parseRepo(v) {
  v = String(v || "").trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const m = v.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/i) || v.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m && !/\.github\.io$/i.test(m[1]) ? `${m[1]}/${m[2]}` : null;
}
// Pages 주소: http(s)만 받는다. javascript: 같은 주소는 거른다
function cleanPages(v) {
  v = String(v || "").trim(); if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
}
const cleanUser = v => String(v || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\/.*$/, "");

function stats(s) {
  const c = { P: 0, L: 0, A: 0, E: 0, U: 0 };
  s.att.forEach(a => c[a]++);
  const counted = c.P + c.L + c.A;                  // 공결과 미체크는 분모에서 뺀다
  let streak = 0;                                   // 최근 연속 결석: 공결과 미체크는 건너뛴다
  for (let i = s.att.length - 1; i >= 0; i--) { if (s.att[i] === "E" || s.att[i] === "U") continue; if (s.att[i] === "A") streak++; else break; }
  const r = rules(), reasons = [];
  if (c.A >= r.abs) reasons.push(`결석 ${c.A}회`);
  if (streak >= r.streak) reasons.push(`연속 결석 ${streak}회`);
  return { ...c, counted, streak, rate: pct(c.P + c.L, counted), reasons, flag: reasons.length > 0 };
}
const watchList = () => students.map(s => ({ s, st: stats(s) })).filter(x => x.st.flag)
  .sort((a, b) => b.st.reasons.length - a.st.reasons.length || b.st.A - a.st.A || b.st.streak - a.st.streak);

// ═════════ GitHub: 커밋 읽기와 판정 ═════════
// 공개 저장소를 로그인 없이 읽는다. 한도는 IP마다 시간당 60번이라, 읽은 결과를 10분 동안 다시 쓴다
const GH_TTL = 10 * 60 * 1000;
const gh = { loading: false, loadedAt: null, remaining: null, resetAt: null };
const commitStatus = list => list.length >= 300 ? "truncated" : list.length ? "ok" : "nocommit";
const READABLE = ["ok", "nocommit", "truncated", "empty"];
const GH_STATUS = {
  none: ["", "미등록"], loading: ["", "불러오는 중"], ok: ["ok", "커밋 {n}개"], nocommit: ["late", "커밋 없음"], truncated: ["late", "최근 300개만 읽음"],
  empty: ["late", "빈 저장소"], notfound: ["absent", "찾을 수 없음"], limit: ["absent", "요청 한도 초과"], error: ["absent", "읽기 실패"], network: ["absent", "연결 실패"],
};
function readLimit(res) {
  const rem = res.headers.get("x-ratelimit-remaining"), reset = res.headers.get("x-ratelimit-reset");
  if (rem !== null) gh.remaining = +rem; if (reset) gh.resetAt = new Date(+reset * 1000);
}
async function fetchCommits(repo, force) {
  const key = KEY + "gh." + repo;
  if (!force) { try { const c = JSON.parse(store.get(key)); if (c && Date.now() - c.at < GH_TTL) return { status: commitStatus(c.commits), commits: c.commits }; } catch {} }
  const commits = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits?since=${dayStart(0).toISOString()}&per_page=100&page=${page}`, { headers: { Accept: "application/vnd.github+json" } });
    readLimit(res);
    if (res.status === 409) return { status: "empty", commits: [] };
    if (res.status === 404) return { status: "notfound", commits: [] };
    if (res.status === 403 || res.status === 429) return { status: "limit", commits: [] };
    if (!res.ok) return { status: "error", commits: [] };
    const list = await res.json();
    list.forEach(c => commits.push({ sha: c.sha.slice(0, 7), date: c.commit.committer?.date || c.commit.author?.date, msg: (c.commit.message || "").split("\n")[0].slice(0, 80), url: c.html_url }));
    if (list.length < 100) break;
  }
  store.set(key, JSON.stringify({ at: Date.now(), commits }));
  return { status: commitStatus(commits), commits };
}
// 과제마다: 그날 커밋 중 마지막 것이 제출, 마감 뒤~다음 회차 전의 첫 커밋이 늦게 제출
function judge(commits) {
  const list = commits.map(c => ({ ...c, d: new Date(c.date) })).sort((a, b) => a.d - b.d);
  return TASKS.map(t => {
    const inTime = list.filter(c => c.d >= dayStart(t.session) && c.d <= dayEnd(t.session)).pop();
    const late = list.find(c => c.d > dayEnd(t.session) && c.d < dayStart(t.session + 1));
    return inTime ? { k: "Y", c: inTime } : late ? { k: "T", c: late } : { k: "N", c: null };
  });
}
function applyGitHub(s) {
  const list = s.gh.commits.map(c => new Date(c.date));
  s.gh.pushed = new Set();
  for (let i = 0; i < SESSIONS; i++) if (list.some(d => d >= dayStart(i) && d <= dayEnd(i))) s.gh.pushed.add(i);
  if (!READABLE.includes(s.gh.status)) return;       // 읽지 못하면 과제 칸을 건드리지 않는다
  judge(s.gh.commits).forEach((r, i) => {
    if (s.subSrc[i] === "manual" || s.sub[i] === "X") return;
    s.sub[i] = r.k; s.subSrc[i] = "gh"; s.ghTask[i] = r.c;
  });
}
async function loadGitHub(force) {
  const targets = students.filter(s => s.repo);
  if (!targets.length) return toast("등록된 저장소가 없습니다. 학생 등록에서 먼저 불러오세요");
  gh.loading = true; targets.forEach(s => s.gh.status = "loading"); render();
  for (const s of targets) {
    try { Object.assign(s.gh, await fetchCommits(s.repo, force)); } catch { s.gh.status = "network"; s.gh.commits = []; }
    applyGitHub(s);
    if (s.gh.status === "limit") { targets.filter(x => x.gh.status === "loading").forEach(x => x.gh.status = "limit"); break; }
  }
  gh.loading = false; gh.loadedAt = new Date(); render();
  const bad = targets.filter(s => !READABLE.includes(s.gh.status)).length;
  toast(bad ? `${targets.length - bad}명을 읽었고, ${bad}명은 읽지 못했습니다` : `${targets.length}명의 커밋을 읽어 과제를 채웠습니다`);
}

// ═════════ 출석과 과제 저장: 화면이 나뉘어서, 한 화면에서 고친 것을 다른 화면이 읽는다 ═════════
function saveState() {
  store.set(KEY + "state", JSON.stringify({ done: state.done, doneAt: state.doneAt,
    students: students.map(s => ({ no: s.no, att: s.att, notes: s.notes, sub: s.sub, subSrc: s.subSrc })) }));
  if ($("ruleAbs") && $("ruleStreak")) store.set(KEY + "rules", JSON.stringify(rules()));
}
function loadState() {
  try {
    const d = JSON.parse(store.get(KEY + "state")); if (!d) return;
    if (Array.isArray(d.done) && d.done.length === SESSIONS) state.done = d.done;
    if (d.doneAt) state.doneAt = d.doneAt;
    (d.students || []).forEach(x => { const s = x && students.find(y => y.no === x.no); if (!s) return;
      if (Array.isArray(x.att) && x.att.length === SESSIONS) s.att = x.att;
      if (Array.isArray(x.sub) && x.sub.length === TASKS.length) { s.sub = x.sub; s.subSrc = x.subSrc || s.subSrc; }
      if (x.notes) s.notes = x.notes; });
  } catch {}
  try { const r = JSON.parse(store.get(KEY + "rules")); if (r && $("ruleAbs")) { $("ruleAbs").value = r.abs; $("ruleStreak").value = r.streak; } } catch {}
}

// ═════════ 저장소 정보 저장 ═════════
function saveRepos() { store.set(KEY + "repos", JSON.stringify(students.map(s => ({ no: s.no, repo: s.repo, pages: s.pages, ghUser: s.ghUser, repoSrc: s.repoSrc })))); }
function loadRepos() {
  try { (JSON.parse(store.get(KEY + "repos")) || []).forEach(r => { const s = r && students.find(y => y.no === r.no); if (s && r.repo) { const { no, ...rest } = r; Object.assign(s, rest); } }); } catch {}
}
function setRepo(s, repo, src) {
  if (s.repo !== repo) { s.repo = repo; s.gh = { status: "none", commits: [], pushed: new Set() }; s.ghTask = []; }
  s.repoSrc = src;
}

// ═════════ 출석 체크 ═════════
function renderCheck() {
  const i = state.session;
  $("sessionTitle").textContent = `${i + 1}회차${i === TODAY ? " · 오늘" : ""}`;
  $("sessionDate").textContent = long(dateOf(i));
  $("prevSession").disabled = i === 0; $("nextSession").disabled = i === SESSIONS - 1;
  const c = { U: 0, P: 0, L: 0, A: 0, E: 0 };
  students.forEach(s => c[s.att[i]]++);
  $("sessionBadge").className = "pill lg " + (state.done[i] ? "ok" : "");
  $("sessionBadge").textContent = state.done[i] ? `체크 완료${state.doneAt[i] ? " · " + state.doneAt[i] : ""}` : "체크 중";

  $("statusCards").innerHTML = ["U", "P", "L", "A", "E"].map(k => `
    <button class="fcard ${k}" data-filter="${k}" aria-pressed="${state.statusFilter === k}">
      <span class="k"><i class="a-dot ${k}"></i>${ATT[k].name}</span><span class="v">${c[k]}<small>명</small></span>
    </button>`).join("");
  $("filterPill").innerHTML = state.statusFilter ? `<span class="pill lg">${ATT[state.statusFilter].name}만 보기 <button class="a-btn link" id="clearFilter" aria-label="거르기 지우기">지우기</button></span>` : "";

  const rows = filterBy($("search").value.trim(), $("section").value).filter(s => !state.statusFilter || s.att[i] === state.statusFilter);
  $("roster").innerHTML = rows.length ? rows.map(s => rosterRow(s, i)).join("") : `<li class="a-empty" style="display:block;text-align:center;color:var(--mute);padding:40px">조건에 맞는 수강생이 없습니다</li>`;

  $("progNum").innerHTML = `${students.length - c.U}<small> / ${students.length}명 체크</small>`;
  $("progStack").innerHTML = ORDER.map(k => `<span class="${k}" style="width:${pct(c[k], students.length)}%"></span>`).join("");
  $("finish").textContent = state.done[i] ? "완료 취소" : "체크 완료";
  $("finish").className = "a-btn block " + (state.done[i] ? "" : "primary");
  $("progHint").textContent = state.done[i] ? "완료한 회차도 고칠 수 있습니다. 고친 내용은 바로 기록에 반영됩니다."
    : c.U ? `아직 체크하지 않은 수강생이 ${c.U}명 있습니다.` : "모두 체크했습니다. 완료를 눌러 마무리하세요.";

  const r = rules();
  $("ruleText").textContent = `누적 결석 ${r.abs}회 이상 또는 연속 결석 ${r.streak}회 이상`;
  const w = watchList();
  $("watchCount").textContent = w.length;
  $("watchList").innerHTML = w.length ? w.map(x => `<li><button data-open="${x.s.id}"><b>${x.s.name} <span class="sub-text">${x.s.no}</span></b>${pill("absent", x.st.reasons.join(" · "))}</button></li>`).join("")
    : `<li class="meta" style="padding:6px 0">기준에 걸린 수강생이 없습니다</li>`;
}
function rosterRow(s, i) {
  const a = s.att[i], st = stats(s), trail = [];
  for (let k = Math.max(0, i - 5); k < i; k++) trail.push(`<i class="${s.att[k]}" title="${k + 1}회차 ${ATT[s.att[k]].name}"></i>`);
  const remark = a !== "U" && a !== "P" ? `<div class="remark"><input class="input sm" data-note="${i}" data-s="${s.id}" value="${esc(s.notes[i] || "")}" placeholder="${PLACEHOLDER[a]}" aria-label="${s.name} ${ATT[a].name} 비고"></div>` : "";
  return `<li class="${a === "U" ? "unchecked" : ""} ${remark ? "has-remark" : ""}" data-row="${s.id}">
    <button class="avatar" data-open="${s.id}" aria-label="${s.name} 자세히">${s.name[0]}</button>
    <div class="who-col"><button class="name-btn" data-open="${s.id}">${s.name}</button>
      <div class="meta">${s.no} · 출석률 ${st.rate}%
        ${trail.length ? `<span class="trail" aria-label="최근 ${trail.length}회">${trail.join("")}</span>` : ""}
        ${st.flag ? pill("absent", "확인 필요") : ""}
        ${s.gh.pushed.has(i) ? pill("", "이날 푸시", "이 날짜에 GitHub 커밋이 있습니다. 출석 판정에는 쓰지 않습니다") : ""}</div></div>
    <div class="seg" role="radiogroup" aria-label="${s.name} ${i + 1}회차 출석">${ORDER.map(k => `<button role="radio" class="${k}" aria-checked="${a === k}" data-set="${k}" data-s="${s.id}">${ATT[k].name}</button>`).join("")}</div>
    ${remark}</li>`;
}

// ═════════ 출석 기록 ═════════
function renderRecord() {
  const rows = filterBy($("search2").value.trim(), $("section2").value).filter(s => !$("onlyWatch").checked || stats(s).flag);
  const all = students.map(stats), sum = k => all.reduce((n, x) => n + x[k], 0);
  $("summary").innerHTML = `<div><dt>평균 출석률</dt><dd>${pct(sum("P") + sum("L"), sum("counted"))}%</dd></div><div><dt>지각</dt><dd>${sum("L")}회</dd></div>
    <div><dt>결석</dt><dd class="A">${sum("A")}회</dd></div><div><dt>공결</dt><dd>${sum("E")}회</dd></div><div><dt>확인 필요</dt><dd class="A">${all.filter(x => x.flag).length}명</dd></div>`;
  $("legend").innerHTML = ["P", "L", "A", "E", "U"].map(k => `<span><span class="cell s-${k}">${ATT[k].mark}</span>${ATT[k].name}</span>`).join("")
    + `<span><span class="cell note" style="background:var(--surface-soft)"></span>비고</span>`
    + (students.some(s => s.gh.pushed.size) ? `<span><span class="cell pushed" style="background:var(--surface-soft)"></span>그날 푸시</span>` : "");
  let h = `<tr><th class="name">수강생</th>`;
  for (let i = 0; i < SESSIONS; i++) h += `<th class="c ${i === TODAY ? "today" : ""}"><button class="head-btn" data-goto="${i}" title="${i + 1}회차 출석 체크로 가기"><b>${i + 1}</b><small>${short(dateOf(i))}</small></button></th>`;
  $("recHead").innerHTML = h + `<th class="c a-sep">출석률</th><th class="c">지각</th><th class="c">결석</th><th class="c">공결</th></tr>`;
  $("recBody").innerHTML = rows.length ? rows.map(s => {
    const st = stats(s);
    let r = `<tr><td class="name"><button class="name-btn" data-open="${s.id}">${s.name}</button><span class="sub-text">${s.no}</span>${st.flag ? `<span class="flag-text">확인 필요</span>` : ""}</td>`;
    s.att.forEach((a, i) => {
      const pushed = s.gh.pushed.has(i);
      const label = `${s.name} ${i + 1}회차 ${ATT[a].name}${s.notes[i] ? " · " + s.notes[i] : ""}${pushed ? " · 그날 GitHub에 푸시함" : ""}`;
      r += `<td class="c"><button class="cell s-${a} ${s.notes[i] ? "note" : ""} ${pushed ? "pushed" : ""}" data-s="${s.id}" data-att="${i}" title="${esc(label)}" aria-label="${esc(label)}">${ATT[a].mark}</button></td>`;
    });
    return r + `<td class="c num a-sep ${st.rate < 80 ? "low" : ""}">${st.rate}%</td>` + ["L", "A", "E"].map(k => `<td class="c ${st[k] ? "" : "zero"}">${st[k]}</td>`).join("") + `</tr>`;
  }).join("") : `<tr><td class="a-empty" colspan="${SESSIONS + 5}">조건에 맞는 수강생이 없습니다</td></tr>`;
}

// ═════════ 과제 확인 ═════════
function taskCounts(i) {
  const due = students.filter(s => s.sub[i] !== "X");
  return { due: due.length, Y: due.filter(s => s.sub[i] === "Y").length, T: due.filter(s => s.sub[i] === "T").length, N: due.filter(s => s.sub[i] === "N").length };
}
function ghPill(s) {
  if (!s.repo) return pill("", "미등록");
  const [cls, text] = GH_STATUS[s.gh.status] || GH_STATUS.none;
  return pill(cls, s.gh.status === "none" ? "아직 안 읽음" : text.replace("{n}", s.gh.commits.length));
}
function workLinks(s) {
  const out = [];
  if (s.pages) out.push(link(s.pages, "작업물 열기"));
  if (s.repo) out.push(link(`https://github.com/${s.repo}`, "저장소"));
  return out.length ? out.join(" · ") : `<span class="muted">없음</span>`;
}
function renderTasks() {
  const linked = students.filter(s => s.repo).length;
  $("ghMeta").innerHTML = [
    `${students.length}명 중 ${linked}명 등록`,
    gh.loadedAt ? `마지막으로 읽은 시각 ${hhmm(gh.loadedAt)}` : "아직 읽지 않음",
    gh.remaining !== null ? `남은 요청 ${gh.remaining}번${gh.remaining < 15 && gh.resetAt ? ` · ${hhmm(gh.resetAt)}에 다시 채워짐` : ""}` : "",
  ].filter(Boolean).join(" · ");
  $("ghLoad").disabled = gh.loading; $("ghLoad").textContent = gh.loading ? "불러오는 중…" : "커밋 불러오기";

  const all = TASKS.map((_, i) => taskCounts(i));
  const tot = all.reduce((a, c) => ({ due: a.due + c.due, done: a.done + c.Y + c.T }), { due: 0, done: 0 });
  $("taskCards").innerHTML = `<button class="fcard" data-task="" aria-pressed="${state.task === null}">
      <span class="k"><i class="a-dot ink"></i>전체</span><span class="v">${pct(tot.done, tot.due)}<small>% 제출</small></span>
      <span class="sub">${linked}명 GitHub 등록</span><span class="bar"><span style="width:${pct(tot.done, tot.due)}%"></span></span></button>`
    + TASKS.map((t, i) => { const c = all[i]; return `<button class="fcard" data-task="${i}" aria-pressed="${state.task === i}">
      <span class="k">과제 ${i + 1} · ${t.name}</span><span class="v">${c.Y + c.T}<small> / ${c.due}명</small></span>
      <span class="sub">${short(dateOf(t.session))}(${t.session + 1}회차) 마감 · 늦게 ${c.T} · 미제출 ${c.N}</span>
      <span class="bar"><span style="width:${pct(c.Y + c.T, c.due)}%"></span></span></button>`; }).join("");

  $("legendTasks").innerHTML = ["U", "Y", "T", "N", "X"].map(k => `<span><span class="cell task s-${k}">${SUB[k].mark}</span>${SUB[k].name}</span>`).join("")
    + `<span><span class="cell task s-Y gh">제출</span>GitHub에서 읽음</span>`;

  const rows = filterBy($("search3").value.trim(), $("section3").value);
  if (state.task === null) {
    $("taskHead").innerHTML = `<tr><th class="name">수강생</th>${TASKS.map((t, i) => `<th class="c task-head"><div class="t">과제 ${i + 1}</div><div class="sub">${t.name} · ${short(dateOf(t.session))}</div></th>`).join("")}<th class="c a-sep">제출률</th><th>GitHub</th><th>작업물</th></tr>`;
    $("taskBody").innerHTML = rows.map(s => {
      const due = s.sub.filter(k => k !== "X").length, done = s.sub.filter(k => k === "Y" || k === "T").length;
      return `<tr><td class="name"><button class="name-btn" data-open="${s.id}">${s.name}</button><span class="sub-text">${s.no}</span></td>`
        + s.sub.map((k, i) => `<td class="c">${taskCell(s, i)}</td>`).join("")
        + `<td class="c num a-sep ${pct(done, due) < 80 ? "low" : ""}">${pct(done, due)}%</td><td>${ghPill(s)}</td><td>${workLinks(s)}</td></tr>`;
    }).join("") || `<tr><td class="a-empty" colspan="8">조건에 맞는 수강생이 없습니다</td></tr>`;
  } else {
    const i = state.task, t = TASKS[i];
    $("taskHead").innerHTML = `<tr><th class="name">수강생</th><th>상태</th><th>제출 커밋</th><th>작업물</th><th class="c">고치기</th></tr>`;
    $("taskBody").innerHTML = rows.map(s => {
      const k = s.sub[i], c = s.ghTask[i], src = s.subSrc[i];
      const commit = src === "gh" && c ? `${short(new Date(c.date))} ${hhmm(new Date(c.date))} · ${link(c.url, c.sha)} <span class="sub-text" style="margin:0">${esc(c.msg)}</span>`
        : src === "manual" ? `<span class="muted">강사가 직접 적음</span>` : src === "gh" ? `<span class="muted">${short(dateOf(t.session))}~다음 회차 전 커밋 없음</span>` : `<span class="muted">아직 GitHub에서 읽지 않음</span>`;
      return `<tr><td class="name"><button class="name-btn" data-open="${s.id}">${s.name}</button><span class="sub-text">${s.no}</span></td>
        <td>${pill(SUB[k].pill, SUB[k].name)}</td><td class="a-wrap">${commit}</td><td>${workLinks(s)}</td><td class="c">${taskCell(s, i)}</td></tr>`;
    }).join("") || `<tr><td class="a-empty" colspan="5">조건에 맞는 수강생이 없습니다</td></tr>`;
  }
}
function taskCell(s, i) {
  const k = s.sub[i], c = s.ghTask[i], src = s.subSrc[i];
  const label = `${s.name} 과제 ${i + 1} ${SUB[k].name}` + (src === "gh" ? (c ? ` · GitHub ${short(new Date(c.date))} ${hhmm(new Date(c.date))} ${c.sha} ${c.msg}` : " · GitHub: 커밋 없음") : src === "manual" ? " · 강사가 고침" : "");
  return `<button class="cell task s-${k} ${src === "gh" ? "gh" : ""}" data-s="${s.id}" data-sub="${i}" title="${esc(label)}" aria-label="${esc(label)}">${SUB[k].mark}</button>`;
}

// ═════════ 학생 등록 ═════════
const reg = { list: [], latest: {}, loadedAt: null, error: "", mounted: null };
const cfg = () => ({ home: parseRepo(store.get(KEY + "home") || CONFIG.home || "") || "", issue: +(store.get(KEY + "issue") || CONFIG.issue || 0) });

// 학생 화면
function meForm() {
  const user = cleanUser($("meUser").value);
  let repoIn = $("meRepo").value.trim();
  if (repoIn && !repoIn.includes("/") && user) repoIn = `${user}/${repoIn}`;   // 저장소 이름만 쓰면 아이디를 붙인다
  return { no: $("meNo").value, user, repo: repoIn ? parseRepo(repoIn) : "", pages: cleanPages($("mePages").value) };
}
function buildLine() {
  const f = meForm();
  $("meRepo").setAttribute("aria-invalid", String($("meRepo").value.trim() !== "" && !f.repo));
  $("mePages").setAttribute("aria-invalid", String(f.pages === null));
  const ok = f.no && f.repo && f.pages !== null;
  $("meLine").textContent = ok ? [f.no, f.repo, f.pages].filter(Boolean).join(" ") : "번호와 저장소를 넣으면 여기에 만들어집니다";
  $("meCopy").disabled = !ok;
  return ok ? $("meLine").textContent : "";
}
function meResult(html) { $("meResult").innerHTML = html; }
async function verifyMine() {
  const f = meForm();
  if (!f.user) return meResult(`<span class="bad">GitHub 아이디를 넣으세요.</span>`);
  if (!f.repo) return meResult(`<span class="bad">과제 저장소를 "아이디/저장소" 꼴로 넣으세요.</span>`);
  meResult("확인하는 중…");
  try {
    const res = await fetch(`https://api.github.com/repos/${f.repo}`, { headers: { Accept: "application/vnd.github+json" } });
    readLimit(res);
    if (res.status === 404) return meResult(`<span class="bad">저장소를 찾을 수 없습니다.</span> 주소가 맞는지, 공개(Public) 저장소인지 확인하세요.`);
    if (res.status === 403 || res.status === 429) return meResult(`<span class="warn">GitHub 요청 한도에 걸렸습니다.</span> 잠시 뒤에 다시 확인하거나, 확인 없이 등록해도 됩니다.`);
    if (!res.ok) return meResult(`<span class="bad">확인하지 못했습니다 (${res.status}).</span>`);
    const r = await res.json(), owner = r.owner?.login || "";
    const lines = [`<span class="ok">공개 저장소를 찾았습니다.</span> 마지막 푸시 ${short(new Date(r.pushed_at))} ${hhmm(new Date(r.pushed_at))}`];
    if (owner.toLowerCase() !== f.user.toLowerCase()) lines.push(`<span class="warn">저장소 주인(${esc(owner)})이 입력한 아이디와 다릅니다.</span>`);
    if (r.has_pages && !f.pages) {
      const guess = r.homepage || (r.name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${owner}.github.io/` : `https://${owner}.github.io/${r.name}/`);
      $("mePages").value = guess; lines.push(`GitHub Pages가 켜져 있어 주소를 채웠습니다.`);
    }
    // 내 과제: 내 저장소의 커밋으로 바로 판정해 보여 준다
    const got = await fetchCommits(f.repo, false);
    if (READABLE.includes(got.status)) {
      lines.push(`<b>내 과제</b><div class="pills">${judge(got.commits).map((x, i) => pill(SUB[x.k].pill, `과제 ${i + 1} ${SUB[x.k].name}${x.c ? " · " + short(new Date(x.c.date)) + " " + hhmm(new Date(x.c.date)) : ""}`)).join("")}</div>`);
    }
    meResult(lines.join("<br>")); buildLine();
  } catch { meResult(`<span class="bad">인터넷에 연결할 수 없습니다.</span> 확인 없이 등록해도 됩니다.`); }
}
async function copyLine() {
  const text = buildLine(); if (!text) return;
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove(); }
  toast("복사했습니다. 아래 댓글 창에 붙여 넣으세요");
}
// 댓글 창: utterances. 강사가 정한 저장소의 이슈 하나에 댓글로 쌓인다
function mountComments() {
  const { home, issue } = cfg(), key = home && issue ? `${home}#${issue}` : "";
  if (reg.mounted === key) return;
  reg.mounted = key;
  const box = $("comments");
  box.innerHTML = "";
  if (!key) { box.innerHTML = `<div class="comments-empty">강사가 등록 창을 아직 열지 않았습니다. 강사가 "등록 댓글을 받는 저장소"를 정하면 여기에 댓글 창이 나옵니다.</div>`; return; }
  const sc = document.createElement("script");
  sc.src = "https://utteranc.es/client.js"; sc.async = true; sc.crossOrigin = "anonymous";
  sc.setAttribute("repo", home); sc.setAttribute("issue-number", String(issue)); sc.setAttribute("theme", "github-light");
  box.appendChild(sc);
}

// 강사 화면: 댓글 한 줄에서 번호, 저장소, Pages 주소를 찾는다
function parseLine(text) {
  const out = { no: "", repo: "", pages: "" };
  const t = String(text || "").replace(/[<>()\[\]{},;]/g, " ");
  const m = t.match(/(?:^|[^\w/.-])([A-Za-z])\s*-\s*(\d{1,2})(?![\w])/);
  if (m) out.no = `${m[1].toUpperCase()}-${m[2].padStart(2, "0")}`;
  t.split(/\s+/).forEach(raw => {
    const tok = raw.replace(/[.:]+$/, ""); if (!tok) return;
    if (/^https?:\/\//i.test(tok)) {
      let u; try { u = new URL(tok); } catch { return; }
      if (/^(www\.)?github\.com$/i.test(u.hostname)) { if (!out.repo) out.repo = parseRepo(tok) || ""; }
      else if (!out.pages) out.pages = cleanPages(tok) || "";
    } else if (/\.github\.io(\/|$)/i.test(tok)) { if (!out.pages) out.pages = cleanPages(tok) || ""; }
    else if (/^github\.com\//i.test(tok) || /^[\w.-]+\/[\w.-]+$/.test(tok)) { if (!out.repo) out.repo = parseRepo(tok) || ""; }
  });
  return out;
}
async function loadRegistrations() {
  const home = parseRepo($("cfgHome").value), issue = +$("cfgIssue").value;
  if (!home || !issue) { reg.error = "등록 댓글을 받는 저장소와 이슈 번호를 넣으세요."; return render(); }
  store.set(KEY + "home", home); store.set(KEY + "issue", String(issue));
  reg.error = ""; $("regLoad").disabled = true; $("regLoad").textContent = "불러오는 중…";
  try {
    const comments = [];
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(`https://api.github.com/repos/${home}/issues/${issue}/comments?per_page=100&page=${page}`, { headers: { Accept: "application/vnd.github+json" } });
      readLimit(res);
      if (res.status === 404) throw new Error("저장소나 이슈를 찾을 수 없습니다. 공개 저장소인지, 이슈 번호가 맞는지 확인하세요.");
      if (res.status === 403 || res.status === 429) throw new Error("GitHub 요청 한도에 걸렸습니다. 잠시 뒤에 다시 불러오세요.");
      if (!res.ok) throw new Error(`불러오지 못했습니다 (${res.status}).`);
      const list = await res.json(); comments.push(...list);
      if (list.length < 100) break;
    }
    reg.list = comments.map(c => ({ ...parseLine(c.body), author: c.user?.login || "", url: c.html_url, at: new Date(c.created_at), id: c.id }));
    reg.loadedAt = new Date();
    applyRegistrations(); toast(`등록 댓글 ${reg.list.length}개를 읽었습니다`);
  } catch (e) { reg.error = e.message || "인터넷에 연결할 수 없습니다."; }
  $("regLoad").disabled = false; $("regLoad").textContent = "등록 불러오기";
  render();
}
// 한 계정은 마지막 댓글만 쓴다(고쳐 쓰면 새 댓글이 이긴다). 같은 번호를 여러 계정이 쓰면 어느 쪽도 반영하지 않는다
function applyRegistrations() {
  const byAuthor = {};
  reg.list.slice().sort((a, b) => b.at - a.at).forEach(r => { const k = r.author.toLowerCase(); if (k && !byAuthor[k]) byAuthor[k] = r; });
  const claims = {};
  Object.values(byAuthor).forEach(r => { if (r.no) (claims[r.no] = claims[r.no] || []).push(r); });
  Object.values(byAuthor).forEach(r => {
    const notes = [];
    if (!r.no) notes.push("번호를 찾지 못함");
    else if (!students.some(s => s.no === r.no)) notes.push("없는 번호");
    else if (claims[r.no].length > 1) notes.push("여러 계정이 같은 번호로 등록");
    if (!r.repo) notes.push("저장소를 찾지 못함");
    else if (r.repo.split("/")[0].toLowerCase() !== r.author.toLowerCase()) notes.push("다른 사람의 저장소");
    r.notes = notes; r.blocked = notes.some(n => n !== "다른 사람의 저장소");
  });
  reg.latest = {};
  Object.values(byAuthor).forEach(r => { if (r.no && !r.blocked) reg.latest[r.no] = r; });
  reg.others = Object.values(byAuthor).filter(r => r.blocked || !r.no);
  students.forEach(s => {
    const r = reg.latest[s.no];
    if (!r || s.repoSrc === "manual") return;      // 강사가 직접 고친 저장소는 덮지 않는다
    setRepo(s, r.repo, "reg"); s.ghUser = r.author; s.pages = r.pages || "";
  });
  saveRepos();
  store.set(KEY + "reg", JSON.stringify(reg.list));
}
function renderRegister() {
  if (!$("meNo").options.length) $("meNo").innerHTML = students.map(s => `<option value="${s.no}">${s.no}</option>`).join("");
  buildLine(); mountComments();
}
function renderRegAdmin() {
  const c = cfg();
  if (document.activeElement !== $("cfgHome") && !$("cfgHome").value) $("cfgHome").value = c.home;
  if (document.activeElement !== $("cfgIssue") && !$("cfgIssue").value && c.issue) $("cfgIssue").value = c.issue;
  const done = students.filter(s => s.repo).length;
  $("regMeta").innerHTML = reg.error ? `<span class="bad">${esc(reg.error)}</span>`
    : [`${students.length}명 중 ${done}명 연결`, reg.loadedAt ? `마지막으로 불러온 시각 ${hhmm(reg.loadedAt)}` : "아직 불러오지 않음",
       persistent ? "" : "이 브라우저에서는 저장할 수 없어 새로 고치면 사라집니다"].filter(Boolean).join(" · ");
  $("editRepos").setAttribute("aria-pressed", String(state.editRepos));
  $("editRepos").textContent = state.editRepos ? "고치기 끝" : "저장소 직접 고치기";
  $("regBody").innerHTML = students.map(s => {
    const r = reg.latest[s.no];
    const repoCell = state.editRepos
      ? `<input class="input sm" data-repo="${s.id}" value="${esc(s.repo)}" placeholder="아이디/저장소" aria-label="${s.name} 저장소" spellcheck="false" style="width:220px">`
      : s.repo ? link(`https://github.com/${s.repo}`, s.repo) : `<span class="muted">없음</span>`;
    const st = s.repoSrc === "manual" ? pill("", "직접 입력") : r ? (r.notes.length ? pill("late", "반영함 · " + r.notes.join(", ")) : pill("ok", "반영함")) : pill("", "대기");
    return `<tr><td class="name"><b>${s.no}</b> <span class="sub-text" style="margin-left:2px">${s.name}</span></td>
      <td>${s.ghUser ? link(`https://github.com/${s.ghUser}`, "@" + s.ghUser) : `<span class="muted">–</span>`}</td>
      <td>${repoCell}</td><td>${s.pages ? link(s.pages, "열기") : `<span class="muted">없음</span>`}</td>
      <td>${r ? `${link(r.url, "댓글")} ${short(r.at)}` : `<span class="muted">–</span>`}</td><td class="a-wrap">${st}</td></tr>`;
  }).join("") + (reg.others || []).map(r => `<tr><td class="name"><b>${esc(r.no || "번호 없음")}</b></td><td>${link(`https://github.com/${r.author}`, "@" + r.author)}</td>
      <td>${r.repo ? esc(r.repo) : "–"}</td><td>${r.pages ? link(r.pages, "열기") : "–"}</td><td>${link(r.url, "댓글")} ${short(r.at)}</td>
      <td class="a-wrap">${pill("absent", "반영 안 함 · " + r.notes.join(", "))}</td></tr>`).join("");
}

// ═════════ 수강생 패널 ═════════
function openPanel(id) {
  $("panel").dataset.id = id; fillPanel();
  $("panel").classList.add("open"); $("panel").setAttribute("aria-hidden", "false"); $("scrim").classList.add("open");
  $("closePanel").focus();
}
function fillPanel() {
  const id = $("panel").dataset.id; if (id === undefined) return;
  const s = students[+id], st = stats(s);
  $("panelBody").innerHTML = `
    <h2 id="panelName">${s.name}</h2>
    <div class="meta">${pill("", s.no)} ${st.flag ? pill("absent", "확인 필요 · " + st.reasons.join(", ")) : ""}
      ${s.ghUser ? link(`https://github.com/${s.ghUser}`, "@" + s.ghUser) : `<span class="muted">GitHub 등록 전</span>`}</div>
    <dl class="a-stats"><div><dt>출석률</dt><dd>${st.rate}%</dd></div><div><dt>지각</dt><dd>${st.L}</dd></div>
      <div><dt>결석</dt><dd style="color:var(--absent)">${st.A}</dd></div><div><dt>공결</dt><dd>${st.E}</dd></div></dl>
    <h3>회차별 출석</h3>
    <ul class="timeline">${s.att.map((a, i) => `<li><span class="when">${i + 1}회차<small>${short(dateOf(i))}</small>${s.gh.pushed.has(i) ? ` ${pill("", "푸시")}` : ""}</span>
      ${pill(ATT_PILL[a], ATT[a].name)}
      ${a === "P" || a === "U" ? "<span></span>" : `<input class="input sm" data-note="${i}" data-s="${s.id}" value="${esc(s.notes[i] || "")}" placeholder="${PLACEHOLDER[a]}" aria-label="${i + 1}회차 비고">`}</li>`).join("")}</ul>
    <h3>과제</h3>
    <ul class="task-rows">${s.sub.map((k, i) => { const c = s.ghTask[i];
      return `<li>${pill(SUB[k].pill, SUB[k].name)} <b>과제 ${i + 1}</b> ${TASKS[i].name}${c && s.subSrc[i] === "gh" ? ` · ${link(c.url, short(new Date(c.date)) + " " + hhmm(new Date(c.date)))}` : ""}</li>`; }).join("")}</ul>
    <p class="meta">작업물: ${workLinks(s)}</p>`;
}
function closePanel() { $("panel").classList.remove("open"); $("panel").setAttribute("aria-hidden", "true"); $("scrim").classList.remove("open"); delete $("panel").dataset.id; }

let toastTimer;
function toast(msg) { $("toast").textContent = msg; $("toast").classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2600); }

function render() {
  ({ check: renderCheck, record: renderRecord, tasks: () => { renderTasks(); renderRegAdmin(); }, register: renderRegister })[state.tab]();
  saveState();
  if ($("attDesc")) $("attDesc").textContent = students.length
    ? `${CLS.name || "수업"} · 수강생 ${students.length}명 · ${SESSIONS}회차 · ${short(dateOf(0))}(${"일월화수목금토"[dateOf(0).getDay()]}) 시작 · 기록은 이 브라우저에만 남습니다`
    : "수강생 명단이 없습니다. lecture/04-deploy/_private/roster.yml에 명단을 적고 다시 빌드합니다";
  const a = document.activeElement;
  if (!(a && a.closest && a.closest("#panel input"))) fillPanel();
}

// ═════════ 사건 ═════════
document.addEventListener("click", e => {
  const t = e.target;
  const open = t.closest("[data-open]"); if (open) return openPanel(+open.dataset.open);
  const f = t.closest("[data-filter]"); if (f) { state.statusFilter = state.statusFilter === f.dataset.filter ? null : f.dataset.filter; return render(); }
  if (t.closest("#clearFilter")) { state.statusFilter = null; return render(); }
  const set = t.closest("[data-set]");
  if (set) {
    const s = students[+set.dataset.s], i = state.session;
    s.att[i] = set.dataset.set; if (s.att[i] === "P") delete s.notes[i];
    render(); document.querySelector(`[data-set="${set.dataset.set}"][data-s="${s.id}"]`)?.focus(); return;
  }
  const go = t.closest("[data-goto]"); if (go) { location.href = root.dataset.urlCheck + "?session=" + go.dataset.goto; return; }
  const tk = t.closest("[data-task]"); if (tk) { state.task = tk.dataset.task === "" ? null : +tk.dataset.task; return render(); }
  const cell = t.closest(".cell[data-s]");
  if (cell) {
    const s = students[+cell.dataset.s];
    if (cell.dataset.att !== undefined) {
      const i = +cell.dataset.att; s.att[i] = NEXT[s.att[i]]; if (s.att[i] === "P") delete s.notes[i];
      render(); document.querySelector(`[data-s="${s.id}"][data-att="${i}"]`)?.classList.add("pop");
    } else {
      const i = +cell.dataset.sub; s.sub[i] = SUB[s.sub[i]].next; s.subSrc[i] = "manual";
      render(); document.querySelector(`[data-s="${s.id}"][data-sub="${i}"]`)?.classList.add("pop");
    }
  }
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.note !== undefined) {
    const s = students[+t.dataset.s], v = t.value.trim();
    if (v) s.notes[t.dataset.note] = v; else delete s.notes[t.dataset.note];
    saveState(); if (state.tab === "record") renderRecord(); return;
  }
  if (t.dataset.repo !== undefined) {
    const s = students[+t.dataset.repo], v = t.value.trim(), repo = v ? parseRepo(v) : "";
    t.setAttribute("aria-invalid", String(repo === null));
    if (repo !== null) { setRepo(s, repo, repo ? "manual" : ""); if (!repo) { s.ghUser = ""; s.pages = ""; } saveRepos(); }
    return;
  }
  if (["meUser", "meRepo", "mePages"].includes(t.id)) return buildLine();
  if (["search", "search2", "search3", "ruleAbs", "ruleStreak"].includes(t.id)) render();
});
document.addEventListener("change", e => { if (["section", "section2", "section3", "onlyWatch"].includes(e.target.id)) render(); if (e.target.id === "meNo") buildLine(); });

on("prevSession", "click", () => { if (state.session > 0) { state.session--; state.statusFilter = null; render(); } });
on("nextSession", "click", () => { if (state.session < SESSIONS - 1) { state.session++; state.statusFilter = null; render(); } });
on("fillRest", "click", () => {
  const i = state.session, rows = filterBy($("search").value.trim(), $("section").value).filter(s => s.att[i] === "U");
  if (!rows.length) return toast("체크하지 않은 수강생이 없습니다");
  rows.forEach(s => s.att[i] = "P"); render(); toast(`${rows.length}명을 출석으로 체크했습니다. 이미 체크한 수강생은 그대로 둡니다`);
});
on("finish", "click", () => {
  const i = state.session;
  if (state.done[i]) { state.done[i] = false; delete state.doneAt[i]; render(); return toast(`${i + 1}회차를 다시 체크 중으로 돌렸습니다`); }
  const left = students.filter(s => s.att[i] === "U");
  if (left.length) { state.statusFilter = "U"; render(); document.querySelectorAll("#roster li").forEach(li => li.classList.add("hl")); return toast(`아직 체크하지 않은 수강생 ${left.length}명만 보여 드립니다`); }
  state.done[i] = true; state.doneAt[i] = hhmm(new Date()); render(); toast(`${i + 1}회차 출석 체크를 마쳤습니다`);
});
on("ruleEdit", "click", () => {
  const box = $("ruleBox"), open = box.hidden; box.hidden = !open;
  $("ruleEdit").setAttribute("aria-expanded", String(open)); $("ruleEdit").textContent = open ? "닫기" : "기준 바꾸기";
  if (open) $("ruleAbs").focus();
});
on("ghLoad", "click", () => loadGitHub(false));
on("meVerify", "click", verifyMine);
on("meCopy", "click", copyLine);
on("regLoad", "click", loadRegistrations);
on("editRepos", "click", () => { state.editRepos = !state.editRepos; render(); });
on("scrim", "click", closePanel);
on("closePanel", "click", closePanel);
document.addEventListener("keydown", e => { if (e.key === "Escape") closePanel(); });

// ═════════ 시작: 분반을 채우고, 저장해 둔 출석, 과제, 등록, 저장소, 커밋을 네트워크 없이 다시 적용한다 ═════════
["section", "section2", "section3"].forEach(id => { const el = $(id); if (el) SECTIONS.forEach(x => el.insertAdjacentHTML("beforeend", `<option value="${esc(x)}">${esc(x)}반</option>`)); });
loadState();
loadRepos();
try { const saved = JSON.parse(store.get(KEY + "reg")); if (Array.isArray(saved) && saved.length) { reg.list = saved.map(r => ({ ...r, at: new Date(r.at) })); applyRegistrations(); } } catch {}
students.filter(s => s.repo).forEach(s => {
  try { const c = JSON.parse(store.get(KEY + "gh." + s.repo)); if (c) { s.gh.status = commitStatus(c.commits); s.gh.commits = c.commits; applyGitHub(s); gh.loadedAt = new Date(c.at); } } catch {}
});
render();
})();
