// 웹 오버레이(index.html의 openOverlay)와 같은 마크업/스타일을 쓰고, 값은 웹이 보낸 스냅샷으로 채운다.
// 마크업은 웹의 #ov-wrap innerHTML과 동일하게 맞춘 복사본 (웹 쪽은 DOM 안에서 직접 만들기 때문).
const SKELETON = `
    <div id="ov-mobs"></div>
    <div class="ov-name" id="ov-name">-</div>
    <div class="ov-time" id="ov-time">00:00:00.00</div>
    <div class="ov-ch-time" id="ov-ch-time" style="display:none"></div>
    <div class="ov-last-item-time" id="ov-last-item-time" style="display:none"></div>
    <div class="ov-btns">
      <button class="ov-toggle" id="ov-toggle">▶ 시작</button>
      <button class="ov-ch" id="ov-ch">채널변경</button>
    </div>
    <div id="ov-cards-row">
      <div class="ov-item" id="ov-item" style="display:none"></div>
      <div class="ov-mcard" id="ov-mcard" style="display:none"></div>
    </div>
    <div class="ov-timeline" id="ov-timeline" style="display:none"></div>`;

const $ = (id) => document.getElementById(id);
const itemImg = (id) => `https://maplestory.io/api/kms/284/item/${id}/icon`;
const mobImg = (id) => `https://maplestory.io/api/kms/284/mob/${id}/icon`;

// 웹 fmtTime과 같은 형식: HH:MM:SS.cc
function fmtTime(ms) {
  ms = Math.max(0, ms);
  const p = (n) => String(n).padStart(2, "0");
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${p(h)}:${p(m)}:${p(s)}.${p(cs)}`;
}

let built = false;
function ensureSkeleton() {
  if (built) return;
  $("ov-wrap").innerHTML = SKELETON;
  $("ov-toggle").addEventListener("click", () => window.overlay.sendCommand({ type: "toggle" }));
  $("ov-ch").addEventListener("click", () => window.overlay.sendCommand({ type: "channel" }));
  // 기준 아이템/몬스터카드 좌클릭 +1 (웹 오버레이와 동일 동작, 실제 증가는 웹이 처리)
  $("ov-item").addEventListener("click", (e) => {
    const card = e.target.closest(".ov-item-card");
    if (card) window.overlay.sendCommand({ type: "inc", mobId: Number(card.dataset.mobId), dropId: Number(card.dataset.baseId) });
  });
  $("ov-mcard").addEventListener("click", (e) => {
    const card = e.target.closest(".ov-mcard-card");
    if (card) window.overlay.sendCommand({ type: "inc", mobId: Number(card.dataset.mobId), dropId: Number(card.dataset.dropId) });
  });
  built = true;
}

// 스냅샷은 0.5초마다 오므로, 사이사이는 마지막 값에 경과 시간을 더해 부드럽게 흘려보냄
let anchor = null; // { elapsed, ch, last, running, at }
function liveMs(base) {
  if (base == null) return null;
  return base + (anchor.running ? performance.now() - anchor.at : 0);
}
function paintTimes() {
  if (anchor) {
    $("ov-time").textContent = fmtTime(liveMs(anchor.elapsed) || 0);
    if (anchor.ch != null) $("ov-ch-time").textContent = fmtTime(liveMs(anchor.ch));
    if (anchor.last != null) $("ov-last-item-time").textContent = fmtTime(liveMs(anchor.last));
  }
  requestAnimationFrame(paintTimes);
}
requestAnimationFrame(paintTimes);

function setShown(el, shown) {
  if (el) el.style.display = shown ? "" : "none";
}

function renderMobs(snap, running) {
  const el = $("ov-mobs");
  const mobs = snap.mobs || [];
  const key = mobs.map((m) => m.img || m.id).join("|");
  if (el.dataset.k !== key) {
    el.dataset.k = key;
    el.innerHTML = mobs.map((m) => {
      if (m.img) return `<span class="ov-mob"><img src="${m.img}"></span>`;
      const base = `https://maplestory.io/api/kms/284/mob/${m.id}/render`;
      const stat = mobImg(m.id);
      return `<span class="ov-mob">` +
        `<img data-anim="move" src="${base}/move" onerror="this.onerror=null;this.src='${stat}'">` +
        `<img data-anim="stand" src="${base}/stand" onerror="this.onerror=null;this.src='${stat}'">` +
        `</span>`;
    }).join("");
  }
  el.querySelectorAll(".ov-mob").forEach((w) => {
    const mv = w.querySelector('[data-anim="move"]');
    const st = w.querySelector('[data-anim="stand"]');
    if (mv && st) { mv.style.display = running ? "" : "none"; st.style.display = running ? "none" : ""; }
  });
}

function renderCards(snap) {
  const s = snap.settings || {};
  const itemEl = $("ov-item");
  const cards = s.ov_show_item ? (snap.itemCards || []) : [];
  if (cards.length) {
    const key = cards.map((c) => `${c.mobId}:${c.dropId}:${c.cnt}:${c.isAuto}`).join("|");
    if (itemEl.dataset.k !== key) {
      itemEl.dataset.k = key;
      itemEl.innerHTML = cards.map((c) =>
        `<div class="ov-item-card" data-mob-id="${c.mobId}" data-base-id="${c.dropId}" title="${c.name}${c.isAuto ? " (자동·가장 흔한)" : " (기준)"} — 좌클릭 +1"><img src="${itemImg(c.dropId)}" onerror="this.style.visibility='hidden'"><div class="ov-item-cnt">${c.cnt}</div></div>`
      ).join("");
    }
  }
  setShown(itemEl, cards.length > 0);
  if (!cards.length) itemEl.dataset.k = "";

  const mcardEl = $("ov-mcard");
  const mcards = s.ov_show_mcard ? (snap.mcards || []) : [];
  if (mcards.length) {
    const key = mcards.map((c) => `${c.mobId}:${c.cnt}`).join("|");
    if (mcardEl.dataset.k !== key) {
      mcardEl.dataset.k = key;
      mcardEl.innerHTML = mcards.map((c) =>
        `<div class="ov-mcard-card" data-mob-id="${c.mobId}" data-drop-id="${c.dropId}" title="몬스터카드 — 좌클릭 +1"><img src="${snap.mcardImg || ""}"><div class="ov-mcard-cnt">${c.cnt}</div></div>`
      ).join("");
    }
  }
  setShown(mcardEl, mcards.length > 0);
  if (!mcards.length) mcardEl.dataset.k = "";

  setShown($("ov-cards-row"), cards.length > 0 || mcards.length > 0);
}

// 타임라인은 웹이 같은 폭 기준으로 만든 HTML을 그대로 받아서 표시
function renderTimeline(snap) {
  const s = snap.settings || {};
  const el = $("ov-timeline");
  const show = !!s.ov_tl_layout && (snap.mobs || []).length > 0 && !!snap.timelineHtml;
  setShown(el, show);
  if (show) el.innerHTML = snap.timelineHtml;
}

// 창 크기를 웹 PiP와 같은 너비, 내용에 맞는 높이로 맞춤
// 설정(스몰/타임라인 등)이 바뀌면 기본 너비로 되돌리고, 그 밖에는 사용자가 늘린 너비를 유지
let lastSize = "", lastWinW = null;
function fitWindow(snap) {
  const small = !!(snap.settings || {}).ov_small;
  const wrap = $("ov-wrap");
  const h = Math.ceil((small ? 6 : 10) + wrap.getBoundingClientRect().height + (small ? 4 : 6));
  const w = snap.winW !== lastWinW ? snap.winW : window.innerWidth;
  lastWinW = snap.winW;
  const key = `${w}x${h}`;
  if (key !== lastSize && w) { lastSize = key; window.overlay.resize(w, h); }
}

function render(snap) {
  ensureSkeleton();
  const s = snap.settings || {};
  const theme = snap.theme || { bg: "#ffffff" };
  const styleEl = document.getElementById("ov-style");
  if (styleEl.dataset.src !== snap.style) { styleEl.dataset.src = snap.style || ""; styleEl.textContent = snap.style || ""; }
  $("ov-wrap").style.background = `${theme.bg}d9`;
  document.body.classList.toggle("small", !!s.ov_small);
  document.body.classList.toggle("tl-layout", !!s.ov_tl_layout);

  const running = !!snap.running;
  const mobs = snap.mobs || [];
  setShown($("ov-mobs"), !!s.ov_show_mob);
  if (s.ov_show_mob) renderMobs(snap, running);

  const nameEl = $("ov-name");
  setShown(nameEl, !!s.ov_show_name);
  nameEl.textContent = mobs.length ? mobs.map((m) => m.name).join(" / ") : "도감작 없음";

  anchor = { elapsed: snap.elapsedMs || 0, ch: snap.chTimeMs, last: snap.lastItemMs, running, at: performance.now() };
  $("ov-time").style.opacity = running ? "1" : ".38";
  paintTimes();

  const chEl = $("ov-ch-time");
  setShown(chEl, !!s.ov_show_chtime && snap.chTimeMs != null);
  const lastEl = $("ov-last-item-time");
  setShown(lastEl, !!s.ov_show_last_item_time && snap.lastItemMs != null);

  const tg = $("ov-toggle");
  tg.textContent = running ? "⏸ 정지" : "▶ 시작";
  tg.className = "ov-toggle" + (running ? " run" : "");

  renderCards(snap);
  renderTimeline(snap);
  fitWindow(snap);
}

window.overlay.onSnapshot(render);

window.overlay.onLinkState((st) => {
  const el = $("link");
  el.textContent = st.connected ? "웹 연결됨" : "연결 끊김 (웹 탭을 열어주세요)";
  el.className = st.connected ? "" : "off";
});
