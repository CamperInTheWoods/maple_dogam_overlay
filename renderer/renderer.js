function fmt(ms) {
  if (ms == null) return "";
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

window.overlay.onSnapshot((snap) => {
  const mobs = snap.mobs || [];
  document.getElementById("name").textContent = mobs.length ? mobs.map((m) => m.name).join(" / ") : "도감작 없음";
  document.getElementById("time").textContent = fmt(snap.elapsedMs) || "00:00:00";
  document.getElementById("time").style.opacity = snap.running ? "1" : ".38";
  const subs = [];
  if (snap.chTimeMs != null) subs.push(`채널 ${fmt(snap.chTimeMs)}`);
  if (snap.lastItemMs != null) subs.push(`마지막 아이템 ${fmt(snap.lastItemMs)}`);
  document.getElementById("sub").textContent = subs.join("  ·  ");
});

window.overlay.onLinkState((st) => {
  const el = document.getElementById("link");
  el.textContent = st.connected ? "웹 연결됨" : "연결 끊김 (웹 탭을 열어주세요)";
  el.className = "link" + (st.connected ? "" : " off");
});
