/* ApexForge 3 — Performance + Progress + Makro Tracking (offline PWA) */

const STORE_KEY = "apexforge3_v1";

const $ = (id) => document.getElementById(id);

const todayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};

const kcalFromMacros = (p,c,f) => (p*4) + (c*4) + (f*9);

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const round1 = (n) => Math.round((n + Number.EPSILON) * 10) / 10;

const defaultState = () => ({
  goals: { p: 180, c: 220, f: 70, kcal: null },
  days: {
    // "YYYY-MM-DD": { weight: 93.0, p:180, c:220, f:70 }
  },
  training: {
    // "YYYY-MM-DD": [ { ex, sets, reps, kg, e1rm, vol, ts } ]
  },
  ui: { range: 14 }
});

function loadState() {
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return defaultState();
    const s = JSON.parse(raw);
    // minimal migration safety
    if(!s.goals) s.goals = defaultState().goals;
    if(!s.days) s.days = {};
    if(!s.training) s.training = {};
    if(!s.ui) s.ui = { range: 14 };
    return s;
  }catch{
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

let state = loadState();

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    $(`tab-${btn.dataset.tab}`).classList.add("active");

    // redraw charts when visiting progress
    if(btn.dataset.tab === "progress") renderCharts();
    if(btn.dataset.tab === "insights") renderInsights();
  });
});

/* ---------- Today Inputs ---------- */
const inWeight = $("inWeight");
const inP = $("inP");
const inC = $("inC");
const inF = $("inF");

const outKcal = $("outKcal");
const outPShare = $("outPShare");
const outCShare = $("outCShare");
const outFShare = $("outFShare");

const barP = $("barP"), barC = $("barC"), barF = $("barF"), barK = $("barK");
const barPText = $("barPText"), barCText = $("barCText"), barFText = $("barFText"), barKText = $("barKText");
const macroHint = $("macroHint");

$("todayDate").textContent = todayKey();

function currentDay() {
  const k = todayKey();
  return state.days[k] || { weight: "", p:"", c:"", f:"" };
}

function setDayInputsFromState() {
  const d = currentDay();
  inWeight.value = d.weight ?? "";
  inP.value = d.p ?? "";
  inC.value = d.c ?? "";
  inF.value = d.f ?? "";
  updateMacroPreview();
}

function num(v){ return Number.isFinite(+v) ? +v : 0; }

function updateMacroPreview(){
  const p = num(inP.value), c = num(inC.value), f = num(inF.value);
  const kcal = kcalFromMacros(p,c,f);

  outKcal.textContent = Math.round(kcal);
  const total = kcal || 1;
  const pK = p*4, cK = c*4, fK = f*9;
  outPShare.textContent = `${Math.round((pK/total)*100)}%`;
  outCShare.textContent = `${Math.round((cK/total)*100)}%`;
  outFShare.textContent = `${Math.round((fK/total)*100)}%`;

  const g = state.goals;
  const goalK = (g.kcal === null || g.kcal === "" || typeof g.kcal === "undefined")
    ? kcalFromMacros(num(g.p), num(g.c), num(g.f))
    : num(g.kcal);

  barPText.textContent = `${p} / ${g.p} g`;
  barCText.textContent = `${c} / ${g.c} g`;
  barFText.textContent = `${f} / ${g.f} g`;
  barKText.textContent = `${Math.round(kcal)} / ${Math.round(goalK)} kcal`;

  barP.style.width = `${clamp((p/(num(g.p)||1))*100, 0, 140)}%`;
  barC.style.width = `${clamp((c/(num(g.c)||1))*100, 0, 140)}%`;
  barF.style.width = `${clamp((f/(num(g.f)||1))*100, 0, 140)}%`;
  barK.style.width = `${clamp((kcal/(goalK||1))*100, 0, 140)}%`;

  const diffP = Math.round(p - num(g.p));
  const diffC = Math.round(c - num(g.c));
  const diffF = Math.round(f - num(g.f));
  macroHint.textContent = `Δ P ${diffP>=0?"+":""}${diffP}g • Δ C ${diffC>=0?"+":""}${diffC}g • Δ F ${diffF>=0?"+":""}${diffF}g`;
}

[inP,inC,inF,inWeight].forEach(el => el.addEventListener("input", updateMacroPreview));

$("btnSaveDay").addEventListener("click", () => {
  const k = todayKey();
  state.days[k] = {
    weight: inWeight.value === "" ? null : round1(num(inWeight.value)),
    p: inP.value === "" ? null : Math.round(num(inP.value)),
    c: inC.value === "" ? null : Math.round(num(inC.value)),
    f: inF.value === "" ? null : Math.round(num(inF.value)),
  };
  saveState();
  updateMacroPreview();
  renderInsights();
  toast("Gespeichert.");
});

$("btnQuickFill").addEventListener("click", () => {
  inP.value = state.goals.p;
  inC.value = state.goals.c;
  inF.value = state.goals.f;
  updateMacroPreview();
});

/* ---------- Training ---------- */
const trEx = $("trEx");
const trSets = $("trSets");
const trReps = $("trReps");
const trKg = $("trKg");
const outVol = $("outVol");
const outE1RM = $("outE1RM");
const trainList = $("trainList");
const trainCount = $("trainCount");

function e1rm(kg, reps){
  // Epley: 1RM = w * (1 + reps/30)
  const r = num(reps);
  const w = num(kg);
  if(w<=0 || r<=0) return 0;
  return w * (1 + (r/30));
}

function trainingPreview(){
  const sets = Math.max(0, Math.round(num(trSets.value)));
  const reps = Math.max(0, Math.round(num(trReps.value)));
  const kg = Math.max(0, num(trKg.value));
  const vol = sets * reps * kg;
  const one = e1rm(kg, reps);

  outVol.textContent = Math.round(vol);
  outE1RM.textContent = one ? round1(one) : 0;
}

[trSets,trReps,trKg].forEach(el => el.addEventListener("input", trainingPreview));

$("btnAddSet").addEventListener("click", () => {
  const ex = (trEx.value || "").trim();
  const sets = Math.max(0, Math.round(num(trSets.value)));
  const reps = Math.max(0, Math.round(num(trReps.value)));
  const kg = Math.max(0, num(trKg.value));

  if(!ex || !sets || !reps || !kg){
    toast("Bitte Übung + Sätze + Reps + Kg ausfüllen.");
    return;
  }

  const k = todayKey();
  if(!state.training[k]) state.training[k] = [];
  const entry = {
    ex, sets, reps, kg,
    e1rm: round1(e1rm(kg, reps)),
    vol: Math.round(sets*reps*kg),
    ts: Date.now()
  };
  state.training[k].unshift(entry);
  saveState();
  renderTrainingToday();
  renderInsights();
  toast("Training geloggt.");
});

$("btnClearTrain").addEventListener("click", () => {
  trEx.value = "";
  trSets.value = "";
  trReps.value = "";
  trKg.value = "";
  trainingPreview();
});

function renderTrainingToday(){
  const k = todayKey();
  const list = state.training[k] || [];
  trainCount.textContent = `${list.length} Einträge`;

  trainList.innerHTML = "";
  if(list.length === 0){
    trainList.innerHTML = `<div class="note">Noch nichts geloggt. Fang an zu schmieden.</div>`;
    return;
  }

  list.forEach((it, idx) => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <strong>${escapeHtml(it.ex)}</strong>
        <div class="sub">${it.sets}×${it.reps} @ ${it.kg} kg • Vol ${it.vol}</div>
      </div>
      <div class="right">
        <div><strong>${it.e1rm}</strong><div class="sub">e1RM</div></div>
        <button class="xbtn" data-idx="${idx}">Löschen</button>
      </div>
    `;
    el.querySelector(".xbtn").addEventListener("click", () => {
      list.splice(idx, 1);
      state.training[k] = list;
      saveState();
      renderTrainingToday();
      renderInsights();
    });
    trainList.appendChild(el);
  });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

/* ---------- Goals ---------- */
const goalP = $("goalP");
const goalC = $("goalC");
const goalF = $("goalF");
const goalK = $("goalK");

function setGoalsInputs(){
  goalP.value = state.goals.p ?? "";
  goalC.value = state.goals.c ?? "";
  goalF.value = state.goals.f ?? "";
  goalK.value = (state.goals.kcal ?? "") === null ? "" : (state.goals.kcal ?? "");
}

$("btnSaveGoals").addEventListener("click", () => {
  state.goals.p = Math.max(0, Math.round(num(goalP.value)));
  state.goals.c = Math.max(0, Math.round(num(goalC.value)));
  state.goals.f = Math.max(0, Math.round(num(goalF.value)));

  const k = goalK.value === "" ? null : Math.max(0, Math.round(num(goalK.value)));
  state.goals.kcal = k;

  saveState();
  updateMacroPreview();
  toast("Ziele gespeichert.");
});

$("btnResetAll").addEventListener("click", () => {
  if(!confirm("Alles löschen? (Tage + Training + Ziele)")) return;
  state = defaultState();
  saveState();
  setDayInputsFromState();
  setGoalsInputs();
  renderTrainingToday();
  renderCharts();
  renderInsights();
  toast("Reset done.");
});

/* ---------- Charts ---------- */
let range = state.ui.range || 14;

document.querySelectorAll(".segBtn").forEach(b => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".segBtn").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    range = Number(b.dataset.range);
    state.ui.range = range;
    saveState();
    renderCharts();
    renderInsights();
  });
});

function lastNDates(n){
  const arr = [];
  const d = new Date();
  for(let i=n-1;i>=0;i--){
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    const y = x.getFullYear();
    const m = String(x.getMonth()+1).padStart(2,"0");
    const day = String(x.getDate()).padStart(2,"0");
    arr.push(`${y}-${m}-${day}`);
  }
  return arr;
}

function getDay(k){
  return state.days[k] || {};
}

function renderCharts(){
  drawWeightChart();
  drawMacroChart();
}

function drawAxes(ctx, w, h){
  ctx.clearRect(0,0,w,h);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;

  // grid
  ctx.strokeStyle = "rgba(148,163,184,.18)";
  const lines = 4;
  for(let i=1;i<=lines;i++){
    const y = Math.round((h/(lines+1))*i);
    ctx.beginPath();
    ctx.moveTo(0,y);
    ctx.lineTo(w,y);
    ctx.stroke();
  }
}

function drawLine(ctx, pts){
  if(pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function drawWeightChart(){
  const cvs = $("chartWeight");
  const ctx = cvs.getContext("2d");
  const w = cvs.width = cvs.clientWidth * devicePixelRatio;
  const h = cvs.height = cvs.clientHeight * devicePixelRatio;

  drawAxes(ctx,w,h);

  const keys = lastNDates(range);
  const vals = keys.map(k => num(getDay(k).weight)).filter(v => v>0);

  ctx.fillStyle = "rgba(233,240,247,.9)";
  ctx.font = `${14*devicePixelRatio}px ui-sans-serif`;
  ctx.fillText(`Gewicht (kg) – letzte ${range} Tage`, 10*devicePixelRatio, 22*devicePixelRatio);

  if(vals.length < 2){
    ctx.fillStyle = "rgba(148,163,184,.8)";
    ctx.fillText("Zu wenig Daten. Speichere tägliche Gewichte.", 10*devicePixelRatio, 48*devicePixelRatio);
    return;
  }

  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const pad = (maxV-minV)*0.15 || 1;
  const lo = minV - pad;
  const hi = maxV + pad;

  const pts = [];
  keys.forEach((k,i) => {
    const v = num(getDay(k).weight);
    if(v<=0) return;
    const x = (i/(keys.length-1)) * (w - 30*devicePixelRatio) + 10*devicePixelRatio;
    const y = (1 - ((v-lo)/(hi-lo))) * (h - 50*devicePixelRatio) + 35*devicePixelRatio;
    pts.push({x,y,v});
  });

  ctx.strokeStyle = "rgba(0,227,174,.95)";
  ctx.lineWidth = 2*devicePixelRatio;
  drawLine(ctx, pts);

  // points
  ctx.fillStyle = "rgba(155,225,93,.95)";
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x,p.y, 2.6*devicePixelRatio, 0, Math.PI*2);
    ctx.fill();
  });

  const last = pts[pts.length-1];
  ctx.fillStyle = "rgba(233,240,247,.9)";
  ctx.fillText(`Letzter: ${round1(last.v)} kg`, 10*devicePixelRatio, (h-12*devicePixelRatio));
}

function drawMacroChart(){
  const cvs = $("chartMacros");
  const ctx = cvs.getContext("2d");
  const w = cvs.width = cvs.clientWidth * devicePixelRatio;
  const h = cvs.height = cvs.clientHeight * devicePixelRatio;

  drawAxes(ctx,w,h);

  const keys = lastNDates(range);
  const series = keys.map(k => {
    const d = getDay(k);
    const p = num(d.p), c = num(d.c), f = num(d.f);
    const kcal = kcalFromMacros(p,c,f);
    return { p, c, f, kcal };
  });

  ctx.fillStyle = "rgba(233,240,247,.9)";
  ctx.font = `${14*devicePixelRatio}px ui-sans-serif`;
  ctx.fillText(`Makros (g) + kcal – letzte ${range} Tage`, 10*devicePixelRatio, 22*devicePixelRatio);

  // scale by kcal for visibility; bars stacked-ish
  const maxK = Math.max(...series.map(s => s.kcal)) || 1;

  const left = 10*devicePixelRatio;
  const rightPad = 10*devicePixelRatio;
  const top = 32*devicePixelRatio;
  const bottom = 16*devicePixelRatio;
  const chartH = h - top - bottom;
  const chartW = w - left - rightPad;
  const bw = chartW / keys.length;

  series.forEach((s,i) => {
    const x = left + i*bw;
    const kH = (s.kcal/maxK) * chartH;

    // kcal bar (background)
    ctx.fillStyle = "rgba(148,163,184,.18)";
    ctx.fillRect(x, top + (chartH - kH), Math.max(1, bw-1*devicePixelRatio), kH);

    // macro overlay proportions
    const total = (s.p+s.c+s.f) || 1;
    const pH = (s.p/total) * kH;
    const cH = (s.c/total) * kH;
    const fH = (s.f/total) * kH;

    let y = top + (chartH - kH);

    ctx.fillStyle = "rgba(0,227,174,.55)"; // protein
    ctx.fillRect(x, y, Math.max(1, bw-1*devicePixelRatio), pH); y += pH;

    ctx.fillStyle = "rgba(155,225,93,.45)"; // carbs
    ctx.fillRect(x, y, Math.max(1, bw-1*devicePixelRatio), cH); y += cH;

    ctx.fillStyle = "rgba(233,240,247,.18)"; // fat
    ctx.fillRect(x, y, Math.max(1, bw-1*devicePixelRatio), fH);
  });

  // legend
  ctx.fillStyle = "rgba(148,163,184,.9)";
  ctx.font = `${12*devicePixelRatio}px ui-sans-serif`;
  ctx.fillText("Overlay: Protein (grün) • Carbs (lime) • Fett (hell)", 10*devicePixelRatio, (h-10*devicePixelRatio));
}

/* ---------- Insights ---------- */
function avg(arr){
  const v = arr.filter(x => Number.isFinite(x));
  if(v.length===0) return null;
  return v.reduce((a,b)=>a+b,0)/v.length;
}

function lastNTrainingCount(n){
  const keys = lastNDates(n);
  let cnt = 0;
  keys.forEach(k => { cnt += (state.training[k]?.length || 0); });
  return cnt;
}

function renderInsights(){
  const keys7 = lastNDates(7);
  const weights7 = keys7.map(k => num(getDay(k).weight)).filter(v => v>0);
  const kcals7 = keys7.map(k => {
    const d = getDay(k);
    const p = num(d.p), c = num(d.c), f = num(d.f);
    const kcal = kcalFromMacros(p,c,f);
    return kcal>0 ? kcal : NaN;
  });

  $("avgW7").textContent = weights7.length ? `${round1(avg(weights7))} kg` : "–";
  const aK = avg(kcals7);
  $("avgK7").textContent = aK ? `${Math.round(aK)} kcal` : "–";

  // Protein hits: days where p >= goalP
  const gP = num(state.goals.p) || 1;
  let hit = 0, total = 0;
  keys7.forEach(k => {
    const p = num(getDay(k).p);
    if(p>0){ total++; if(p>=gP) hit++; }
  });
  $("hitP").textContent = total ? `${hit}/${total}` : "–";

  $("tr7").textContent = `${lastNTrainingCount(7)} Logs`;

  // best e1RM 30 days grouped by exercise
  const keys30 = lastNDates(30);
  const best = new Map();
  keys30.forEach(k => {
    (state.training[k] || []).forEach(t => {
      const cur = best.get(t.ex);
      if(!cur || t.e1rm > cur.e1rm) best.set(t.ex, t);
    });
  });

  const sorted = [...best.values()].sort((a,b)=>b.e1rm-a.e1rm).slice(0,8);
  const box = $("bestE1RM");
  box.innerHTML = "";
  if(sorted.length === 0){
    box.innerHTML = `<div class="note">Noch keine Trainingsdaten. Logge ein paar Sätze – dann wird’s spannend.</div>`;
  }else{
    sorted.forEach(t => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div>
          <strong>${escapeHtml(t.ex)}</strong>
          <div class="sub">${t.sets}×${t.reps} @ ${t.kg} kg</div>
        </div>
        <div class="right">
          <div><strong>${t.e1rm}</strong><div class="sub">e1RM</div></div>
        </div>
      `;
      box.appendChild(el);
    });
  }
}

/* ---------- Export / Import ---------- */
$("btnExport").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `apexforge3-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

$("fileImport").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if(!file) return;
  try{
    const txt = await file.text();
    const obj = JSON.parse(txt);
    // very light validation
    if(typeof obj !== "object" || !obj) throw new Error("invalid");
    state = { ...defaultState(), ...obj };
    saveState();
    setDayInputsFromState();
    setGoalsInputs();
    renderTrainingToday();
    renderCharts();
    renderInsights();
    toast("Import erfolgreich.");
  }catch{
    toast("Import fehlgeschlagen (JSON ungültig).");
  }finally{
    e.target.value = "";
  }
});

/* ---------- Service Worker ---------- */
async function registerSW(){
  if(!("serviceWorker" in navigator)) {
    $("pwaState").textContent = "Service Worker nicht verfügbar";
    return;
  }
  try{
    const reg = await navigator.serviceWorker.register("./sw.js");
    $("pwaState").textContent = reg.active ? "Offline aktiv" : "Wird aktiviert…";
  }catch{
    $("pwaState").textContent = "SW Registrierung fehlgeschlagen";
  }
}
registerSW();

$("btnUpdateSW").addEventListener("click", async () => {
  try{
    const regs = await navigator.serviceWorker.getRegistrations();
    for(const r of regs) await r.unregister();
    await registerSW();
    toast("Cache refreshed (reload empfohlen).");
  }catch{
    toast("Cache refresh fehlgeschlagen.");
  }
});

/* ---------- Init ---------- */
setGoalsInputs();
setDayInputsFromState();
trainingPreview();
renderTrainingToday();
renderInsights();

// set selected range button UI
document.querySelectorAll(".segBtn").forEach(b => {
  b.classList.toggle("active", Number(b.dataset.range) === range);
});

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg){
  let el = document.getElementById("toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast";
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "18px";
    el.style.transform = "translateX(-50%)";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "14px";
    el.style.border = "1px solid rgba(148,163,184,.22)";
    el.style.background = "rgba(15,22,32,.92)";
    el.style.backdropFilter = "blur(10px)";
    el.style.boxShadow = "0 16px 50px rgba(0,0,0,.35)";
    el.style.color = "rgba(233,240,247,.95)";
    el.style.fontWeight = "700";
    el.style.zIndex = "999";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = "0"; }, 1400);
}
