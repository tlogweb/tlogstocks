/*
  tlog-stocks.js
  - 주식 매매일지 전용 로직
  - 코인 버전과 비슷하지만 포지션 관련 통계/필드가 없고,
    나머지 로컬스토리지, 차트, CSV, 모달, 폼 처리 구조는 동일
*/

/* ===== 페이지/키 ===== */
const PAGE_ID = "stock";
const STORAGE_KEY     = `tj:${PAGE_ID}:entries_v1`;
const PRINCIPLES_KEY  = `tj:${PAGE_ID}:principles_v1`;
const SETTINGS_KEY    = `tj:${PAGE_ID}:settings_v1`;
const MIGRATED_FLAG   = `tj:${PAGE_ID}:settings_migrated_v1`;
const LEGACY_SETTINGS_KEY = "tradeJournalSettings_v1";

/* ===== 상태 ===== */
let entries = [];
let settings = { startingCash: 10000000 };
let currentId = null;
let currentRange = { type:"ALL", from:null, to:null };

/* ===== 엘리먼트 ===== */
const form = document.getElementById("trade-form");
const tableBody = document.getElementById("trade-table-body");
const emptyState = document.getElementById("empty-state");
const clearAllBtn = document.getElementById("clear-all-btn");
const resetFormBtn = document.getElementById("reset-form-btn");

const principlesTextarea = document.getElementById("principles");
const principlesSaveBtn = document.getElementById("principles-save-btn");
const principlesResetBtn = document.getElementById("principles-reset-btn");
const principlesStatus = document.getElementById("principles-status");

const startingCashInput = document.getElementById("startingCash");
const saveCashBtn = document.getElementById("save-cash-btn");
const statEquity = document.getElementById("stat-equity");
const statTotalPnl = document.getElementById("stat-totalpnl");
const statCumRet = document.getElementById("stat-cumret");
// 오늘 손익 / 수익률 표시용
const statTodayPnl = document.getElementById("stat-today-pnl");
const statTodayRet = document.getElementById("stat-today-ret");
const chartCanvas = document.getElementById("equityChart");
const ctx = chartCanvas.getContext("2d");
const chartTooltip = document.getElementById("chartTooltip");
const rangeToolbar = document.getElementById("rangeToolbar");

// 모달
const modalBackdrop = document.getElementById("modal-backdrop");
const modalBody = document.getElementById("modal-body");
const m_date = document.getElementById("m_date");
const m_symbol = document.getElementById("m_symbol");
const m_avgEntry = document.getElementById("m_avgEntry");
const m_entry1 = document.getElementById("m_entry1");
const m_entry2 = document.getElementById("m_entry2");
const m_entry3 = document.getElementById("m_entry3");
const m_qty = document.getElementById("m_qty");
const m_pnl = document.getElementById("m_pnl");
const m_pnlp = document.getElementById("m_pnlp");
const m_reason = document.getElementById("m_reason");
const m_exit = document.getElementById("m_exit");
const m_lesson = document.getElementById("m_lesson");
const modalClose = document.getElementById("modal-close");
const modalEdit = document.getElementById("modal-edit");
const modalSave = document.getElementById("modal-save");
const modalCancel = document.getElementById("modal-cancel");
const modalDelete = document.getElementById("modal-delete");

// CSV
const exportBtn = document.getElementById("export-csv-btn");
const importBtn = document.getElementById("import-csv-btn");
const csvFileInput = document.getElementById("csv-file");

/* ===== 유틸 ===== */
const fmtInt = (n) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(
    Math.round(n || 0)
  );
const fmt2 = (n) =>
  n === "" || n === null || typeof n === "undefined" || isNaN(Number(n))
    ? ""
    : Number(n).toFixed(2);
const todayISO = () => new Date().toISOString().slice(0, 10);
const toDate = (d) => new Date(d + "T00:00:00");

function startOfThisMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addMonths(date, m) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + m);
  d.setHours(0, 0, 0, 0);
  return d;
}
function formatISO(d) {
  const z = (n) => (n < 10 ? "0" : "") + n;
  return (
    d.getFullYear() +
    "-" +
    z(d.getMonth() + 1) +
    "-" +
    z(d.getDate())
  );
}

// 날짜 입력 자동 캘린더 오픈
function autoOpenCalendars() {
  document.querySelectorAll('input[type="date"]').forEach((el) => {
    if (el.__hooked) return;
    el.__hooked = true;
    el.addEventListener("click", () => {
      if (typeof el.showPicker === "function") el.showPicker();
    });
    el.addEventListener("keydown", (ev) => {
      if (ev.code === "Space" || ev.code === "Enter") {
        ev.preventDefault();
        if (typeof el.showPicker === "function") el.showPicker();
        else el.focus();
      }
    });
  });
}
document.addEventListener("DOMContentLoaded", autoOpenCalendars);

/* 초기 날짜 설정 */
(function initDate() {
  document.getElementById("date").value = todayISO();
})();

/* ===== 원칙 ===== */
function loadPrinciples() {
  try {
    const stored = localStorage.getItem(PRINCIPLES_KEY);
    if (stored !== null) {
      principlesTextarea.value = stored;
      principlesStatus.textContent = stored.trim()
        ? "마지막 저장된 매매 원칙을 불러왔습니다."
        : "저장된 내용이 비어 있습니다. 원칙을 작성해 보세요.";
    } else principlesStatus.textContent = "아직 저장된 매매 원칙이 없습니다.";
  } catch (e) {
    console.error(e);
    principlesStatus.textContent =
      "원칙을 불러오는 중 오류가 발생했습니다.";
  }
}
function savePrinciples() {
  try {
    localStorage.setItem(
      PRINCIPLES_KEY,
      (principlesTextarea.value || "").trim()
    );
    principlesStatus.textContent = `저장됨: ${new Date().toLocaleString()}`;
  } catch (e) {
    console.error(e);
    principlesStatus.textContent = "저장 중 오류가 발생했습니다.";
  }
}
principlesSaveBtn.addEventListener("click", savePrinciples);
principlesTextarea.addEventListener("blur", () => {
  const current = (principlesTextarea.value || "").trim();
  const stored = localStorage.getItem(PRINCIPLES_KEY) || "";
  if (current !== stored) savePrinciples();
});
principlesResetBtn.addEventListener("click", () => {
  if (confirm("매매 원칙 내용을 모두 비우고 저장된 데이터도 삭제할까요?")) {
    principlesTextarea.value = "";
    localStorage.removeItem(PRINCIPLES_KEY);
    principlesStatus.textContent = "매매 원칙이 삭제되었습니다.";
  }
});

/* ===== 설정 (분리 + 1회 마이그레이션) ===== */
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.startingCash === "number" && p.startingCash >= 0) {
        settings.startingCash = p.startingCash;
        startingCashInput.value = settings.startingCash;
        return;
      }
    }
    const migrated = localStorage.getItem(MIGRATED_FLAG);
    if (!migrated) {
      const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
      if (legacy) {
        const lp = JSON.parse(legacy);
        if (typeof lp?.startingCash === "number" && lp.startingCash >= 0) {
          settings.startingCash = lp.startingCash;
          localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify({ startingCash: settings.startingCash })
          );
          localStorage.setItem(MIGRATED_FLAG, "1");
          startingCashInput.value = settings.startingCash;
          return;
        }
      }
      localStorage.setItem(MIGRATED_FLAG, "1");
    }
  } catch (e) {
    console.error("loadSettings error:", e);
  }
  startingCashInput.value = settings.startingCash;
}
function saveSettings() {
  const val = parseFloat(startingCashInput.value);
  if (isNaN(val) || val < 0) {
    alert("예수금은 0 이상 숫자여야 합니다.");
    return;
  }
  settings.startingCash = val;
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ startingCash: settings.startingCash })
  );
  renderTable();
  renderStatsAndChart();
}
saveCashBtn.addEventListener("click", saveSettings);

/* ===== 기록 ===== */
function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    entries = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(entries)) entries = [];
  } catch (e) {
    console.error(e);
    entries = [];
  }
}
function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/* ===== 프리셋 ===== */
function setRangePreset(type) {
  const now = new Date();
  let from = null;
  if (type === "WEEK") from = startOfThisMonday(now);
  else if (type === "1M") from = addMonths(now, -1);
  else if (type === "3M") from = addMonths(now, -3);
  else if (type === "6M") from = addMonths(now, -6);
  else if (type === "1Y") from = addMonths(now, -12);
  currentRange = { type, from, to: now };
  highlightActiveRange(type);
  renderTable();
  renderStatsAndChart();
}
function highlightActiveRange(type) {
  [...rangeToolbar.querySelectorAll("button[data-range]")].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.range === type);
  });
}
rangeToolbar.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-range]");
  if (!btn) return;
  setRangePreset(btn.dataset.range);
});

/* ===== 테이블 ===== */
function entriesInWindow() {
  const from = currentRange.from;
  const to = currentRange.to || new Date();
  return entries.filter((e) => {
    const d = e.date ? toDate(e.date) : new Date(e.createdAt || Date.now());
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}
function renderTable() {
  const rows = entriesInWindow()
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  tableBody.innerHTML = "";
  if (!rows.length) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";
  rows.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.dataset.id = entry.id;
    const pnlNum = parseFloat(entry.pnl || 0);
    let pnlClass =
      pnlNum > 0 ? "pnl-positive" : pnlNum < 0 ? "pnl-negative" : "pnl-zero";
    tr.innerHTML = `
      <td>${entry.date || ""}</td>
      <td>${entry.symbol || ""}</td>
      <td class="text-mono">${fmt2(entry.avgEntry)}</td>
      <td class="text-mono">${fmt2(entry.quantity)}</td>
      <td class="${pnlClass}">${fmt2(entry.pnl)}</td>
      <td class="${pnlClass}">${fmt2(entry.pnlPercent)}</td>
    `;
    tableBody.appendChild(tr);
  });
}

/* ===== 그래프 ===== */
function computeEquitySeries() {
  const startCash = Number(settings.startingCash) || 0;
  const from = currentRange.from;
  const now = currentRange.to || new Date();

  const pnlBefore = entries.reduce((acc, e) => {
    const d = e.date ? toDate(e.date) : new Date(e.createdAt || Date.now());
    if (from && d < from) acc += Number(e.pnl) || 0;
    return acc;
  }, 0);
  const baselineEquity = startCash + pnlBefore;

  const rows = entries
    .filter((e) => {
      const d = e.date ? toDate(e.date) : new Date(e.createdAt || Date.now());
      if (from && d < from) return false;
      if (d > now) return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      const da = a.date ? toDate(a.date) : new Date(a.createdAt || 0);
      const db = b.date ? toDate(b.date) : new Date(b.createdAt || 0);
      return da - db;
    });

  let cum = 0;
  const points = [];
  const firstLabel = from ? formatISO(from) : rows[0]?.date || "Start";
  points.push({ label: firstLabel, equity: baselineEquity, pnl: 0 });

  rows.forEach((e) => {
    const pnl = Number(e.pnl) || 0;
    cum += pnl;
    const label = e.date
      ? e.date
      : formatISO(new Date(e.createdAt || Date.now()));
    points.push({ label, equity: baselineEquity + cum, pnl: cum });
  });

  if (points.length === 1)
    points.push({ label: formatISO(now), equity: baselineEquity, pnl: 0 });

  return { baselineEquity, lastEquity: baselineEquity + cum, totalPnl: cum, points };
}

let lastChartGeom = null;
function drawChart(points, baseline) {
  const w = chartCanvas.width,
    h = chartCanvas.height;
  const padL = 40,
    padR = 10,
    padT = 10,
    padB = 30;
  const innerW = w - padL - padR,
    innerH = h - padT - padB;
  ctx.clearRect(0, 0, w, h);

  const values = points.length ? points.map((p) => p.equity) : [baseline, baseline];
  const minV = Math.min(...values),
    maxV = Math.max(...values);
  const span = maxV - minV || 1;

  const yBase = h - padB - ((baseline - minV) / span) * innerH;
  ctx.strokeStyle = "rgba(148,163,184,.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, yBase);
  ctx.lineTo(w - padR, yBase);
  ctx.stroke();

  ctx.strokeStyle = "rgba(59,130,246,.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = padL + (i / Math.max(points.length - 1, 1)) * innerW;
    const y = h - padB - ((p.equity - minV) / span) * innerH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px system-ui, -apple-system, Segoe UI";
  [maxV, baseline, minV].forEach((v) => {
    const y = h - padB - ((v - minV) / span) * innerH;
    ctx.fillText(fmtInt(v), 4, y + 3);
  });

  lastChartGeom = {
    padL,
    padR,
    padT,
    padB,
    innerW,
    innerH,
    minV,
    span,
    w,
    h,
    points,
  };
}

/* ===== 오늘 손익 / 수익률 통계 =====
   - 오늘 날짜에 입력된 매매들의 손익 합계
   - 예수금 기준 수익률, 전일(이전 거래일) 대비 수익률
*/
function renderTodayStats() {
  if (!statTodayPnl || !statTodayRet) return;

  const startCash = Number(settings.startingCash) || 0;
  const today = todayISO();

  // 날짜별로 일간 손익 합산
  const dailyPnl = {};
  entries.forEach((e) => {
    if (!e.date) return;
    const d = e.date;
    const pnl = Number(e.pnl) || 0;
    dailyPnl[d] = (dailyPnl[d] || 0) + pnl;
  });

  const dates = Object.keys(dailyPnl).sort(); // "YYYY-MM-DD" 문자열 정렬
  let cum = 0;
  const equityByDate = {};

  // 날짜별 누적 평가금
  dates.forEach((d) => {
    cum += dailyPnl[d];
    equityByDate[d] = startCash + cum;
  });

  // 오늘 손익
  const todayPnl = dailyPnl[today] || 0;
  statTodayPnl.textContent = fmtInt(todayPnl);

  // 이전 거래일(오늘보다 작은 날짜 중 가장 최근)
  let prevEquity = startCash;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] < today) {
      prevEquity = equityByDate[dates[i]];
      break;
    }
  }

  // 예수금 기준 수익률
  const retOnCash =
    startCash > 0 ? ((todayPnl / startCash) * 100).toFixed(2) + "%" : "-";

  // 전일 대비 수익률 (전일 평가금 기준)
  const retVsPrev =
    prevEquity > 0 ? ((todayPnl / prevEquity) * 100).toFixed(2) + "%" : "-";

  statTodayRet.textContent = `예수금 기준: ${retOnCash} / 전일 대비: ${retVsPrev}`;
}


function renderStatsAndChart() {
  const { baselineEquity, lastEquity, totalPnl, points } =
    computeEquitySeries();
  statEquity.textContent = fmtInt(lastEquity);
  statTotalPnl.textContent = fmtInt(totalPnl);
  const base = baselineEquity;
  const cumRet = base > 0 ? ((lastEquity - base) / base) * 100 : 0;
  statCumRet.textContent = base ? cumRet.toFixed(2) : "-";
  drawChart(points, baselineEquity);

  // 오늘 통계도 같이 갱신
  renderTodayStats();
}


chartCanvas.addEventListener("mousemove", (e) => {
  if (!lastChartGeom) return;

  const rect = chartCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left; // 캔버스 안에서의 마우스 X
  const { padL, innerW, points, minV, span, h, padB, innerH } =
    lastChartGeom;
  if (!points.length) return;

  let t = (x - padL) / innerW;
  t = Math.max(0, Math.min(1, t));
  const idx = Math.round(t * (points.length - 1));
  const p = points[idx];

  const px = padL + (idx / Math.max(points.length - 1, 1)) * innerW;
  const py = h - padB - ((p.equity - minV) / span) * innerH;

  const tooltip = document.getElementById("chartTooltip");
  const base = points[0]?.equity || 0;
  const ret = base > 0 ? ((p.equity - base) / base) * 100 : 0;

  tooltip.style.display = "block";
  tooltip.innerHTML = `
    <div style="font-weight:700; margin-bottom:4px;">${p.label}</div>
    <div>누적 손익: <span style="color:#93c5fd">${fmtInt(
      p.equity - base
    )}</span></div>
    <div>누적 수익률: <span style="color:#93c5fd">${ret.toFixed(
      2
    )}%</span></div>
    <div>평가금: <span style="color:#93c5fd">${fmtInt(p.equity)}</span></div>`;

  // === 위치 계산 (차트 가운데 기준) ===
  const centerX = rect.width / 2;
  const tooltipWidth = tooltip.offsetWidth || 150;

  let tooltipX;
  if (x > centerX) {
    // 오른쪽 절반 → 툴팁을 왼쪽에
    tooltipX = px - tooltipWidth - 12;
  } else {
    // 왼쪽 절반 → 툴팁을 오른쪽에
    tooltipX = px + 12;
  }

  tooltipX = Math.max(0, Math.min(tooltipX, rect.width - tooltipWidth));

  tooltip.style.left = tooltipX + "px";
  tooltip.style.top = py - 10 + "px";
});

chartCanvas.addEventListener("mouseleave", () => {
  document.getElementById("chartTooltip").style.display = "none";
});

/* ===== 제출 ===== */
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const date = document.getElementById("date").value || todayISO();
  const symbol = document.getElementById("symbol").value.trim();
  const avgEntry = document.getElementById("avgEntry").value;
  const entry1 = document.getElementById("entry1").value;
  const entry2 = document.getElementById("entry2").value;
  const entry3 = document.getElementById("entry3").value;
  const quantity = document.getElementById("quantity").value;
  const pnl = document.getElementById("pnl").value;
  const pnlPercent = document.getElementById("pnlPercent").value;
  const reason = document.getElementById("reason").value.trim();
  const exitReason = document.getElementById("exitReason").value.trim();
  const lesson = document.getElementById("lesson").value.trim();

  if (!date || !symbol || !avgEntry || !quantity) {
    alert("날짜, 종목, 평균 진입가, 수량은 필수입니다.");
    return;
  }
  const newEntry = {
    id: Date.now(),
    createdAt: Date.now(),
    date,
    symbol,
    avgEntry,
    entry1,
    entry2,
    entry3,
    quantity,
    pnl,
    pnlPercent,
    reason,
    exitReason,
    lesson,
  };
  entries.push(newEntry);
  saveEntries();
  renderTable();
  renderStatsAndChart();
  resetForm();
});

/* ===== 모달 ===== */
tableBody.addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  openModal(Number(tr.dataset.id));
});
function openModal(id) {
  currentId = id;
  const row = entries.find((r) => r.id === id);
  if (!row) return;

  m_date.value = row.date || "";
  m_symbol.value = row.symbol || "";
  m_avgEntry.value = row.avgEntry || "";
  m_entry1.value = row.entry1 || "";
  m_entry2.value = row.entry2 || "";
  m_entry3.value = row.entry3 || "";
  m_qty.value = row.quantity || "";
  m_pnl.value = row.pnl || "";
  m_pnlp.value = row.pnlPercent || "";
  m_reason.value = row.reason || "";
  m_exit.value = row.exitReason || "";
  m_lesson.value = row.lesson || "";

  setModalReadOnly(true);
  modalBackdrop.style.display = "flex";
  document.body.classList.add("modal-open");
  setTimeout(() => modalClose.focus(), 0);
}
function closeModal() {
  modalBackdrop.style.display = "none";
  document.body.classList.remove("modal-open");
  currentId = null;
}
function setModalReadOnly(ro) {
  const controls = [
    m_date,
    m_symbol,
    m_avgEntry,
    m_entry1,
    m_entry2,
    m_entry3,
    m_qty,
    m_pnl,
    m_pnlp,
    m_reason,
    m_exit,
    m_lesson,
  ];
  controls.forEach((el) => (el.disabled = ro));
  modalBody.classList.toggle("readonly", ro);
  document.getElementById("modal-edit").style.display = ro ? "" : "none";
  document.getElementById("modal-save").style.display = ro ? "none" : "";
  document.getElementById("modal-cancel").style.display = ro ? "none" : "";
}
modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalBackdrop.style.display === "flex")
    closeModal();
});
document
  .getElementById("modal-edit")
  .addEventListener("click", () => setModalReadOnly(false));
document.getElementById("modal-cancel").addEventListener("click", () => {
  if (currentId !== null) openModal(currentId);
});
document.getElementById("modal-save").addEventListener("click", () => {
  if (currentId === null) return;
  if (!m_date.value || !m_symbol.value || !m_avgEntry.value || !m_qty.value) {
    alert("날짜, 종목, 평균 진입가, 수량은 필수입니다.");
    return;
  }
  entries = entries.map((row) => {
    if (row.id !== currentId) return row;
    return {
      ...row,
      date: m_date.value,
      symbol: m_symbol.value,
      avgEntry: m_avgEntry.value,
      entry1: m_entry1.value,
      entry2: m_entry2.value,
      entry3: m_entry3.value,
      quantity: m_qty.value,
      pnl: m_pnl.value,
      pnlPercent: m_pnlp.value,
      reason: m_reason.value.trim(),
      exitReason: m_exit.value.trim(),
      lesson: m_lesson.value.trim(),
    };
  });
  saveEntries();
  renderTable();
  renderStatsAndChart();
  setModalReadOnly(true);
});
document.getElementById("modal-delete").addEventListener("click", () => {
  if (currentId === null) return;
  if (!confirm("이 매매 기록을 삭제할까요?")) return;
  entries = entries.filter((r) => r.id !== currentId);
  saveEntries();
  renderTable();
  renderStatsAndChart();
  closeModal();
});

/* ===== CSV ===== */
exportBtn.addEventListener("click", () => {
  const header = [
    "id",
    "createdAt",
    "date",
    "symbol",
    "avgEntry",
    "entry1",
    "entry2",
    "entry3",
    "quantity",
    "pnl",
    "pnlPercent",
    "reason",
    "exitReason",
    "lesson",
  ];
  const lines = [header.join(",")];
  entries.forEach((e) => {
    const row = header.map((k) => {
      let v = e[k] ?? "";
      v = String(v).replace(/"/g, '""');
      return `"${v}"`;
    });
    lines.push(row.join(","));
  });
  const csv = lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stock_journal_${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
importBtn.addEventListener("click", () => csvFileInput.click());
csvFileInput.addEventListener("change", () => {
  const file = csvFileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const text = String(ev.target.result || "");
      const parsed = parseCSV(text);
      const normalized = normalizeImportedRows(parsed);
      if (!normalized.length) {
        alert("가져올 유효한 행이 없습니다.");
        csvFileInput.value = "";
        return;
      }
      const merge = confirm(
        "기존 기록에 '추가 병합'할까요?\n[확인]=병합  [취소]=전체 교체"
      );
      entries = merge ? entries.concat(normalized) : normalized;
      saveEntries();
      renderTable();
      renderStatsAndChart();
      alert(`가져오기 완료: ${normalized.length}건`);
    } catch (err) {
      console.error(err);
      alert("CSV 파싱 오류");
    } finally {
      csvFileInput.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
});
function parseCSV(text) {
  const rows = [];
  let i = 0,
    cell = "",
    inQ = false,
    row = [];
  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") pushCell();
      else if (ch === "\r") {
      } else if (ch === "\n") {
        pushCell();
        pushRow();
      } else cell += ch;
    }
    i++;
  }
  if (cell.length || inQ || row.length) {
    pushCell();
    pushRow();
  }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  const data = rows
    .slice(1)
    .filter(
      (r) => r.length > 1 || (r[0] && r[0].trim() !== "")
    );
  return data.map((r) => {
    const o = {};
    header.forEach((h, idx) => (o[h] = r[idx] ?? ""));
    return o;
  });
}
function normalizeImportedRows(items) {
  const g = (o, keys) =>
    keys.find((k) => k in o) ? o[keys.find((k) => k in o)] : "";
  const out = [];
  items.forEach((o, idx) => {
    const date = g(o, ["date", "날짜"]);
    const symbol = g(o, ["symbol", "종목"]);
    const avgEntry = g(o, ["avgEntry", "평균진입가", "평균 진입가"]);
    const entry1 = g(o, ["entry1", "1차진입가", "1차 진입가"]);
    const entry2 = g(o, ["entry2", "2차진입가", "2차 진입가"]);
    const entry3 = g(o, ["entry3", "3차진입가", "3차 진입가"]);
    const quantity = g(o, ["quantity", "수량"]);
    const pnl = g(o, ["pnl", "손익"]);
    const pnlPercent = g(o, ["pnlPercent", "손익률", "pnl%"]);
    const reason = g(o, ["reason", "진입근거"]);
    const exitReason = g(o, ["exitReason", "청산이유"]);
    const lesson = g(o, ["lesson", "교훈"]);
    if (!date || !avgEntry || !quantity) return;

    let id = g(o, ["id"]);
    let createdAt = g(o, ["createdAt"]);
    if (!id) id = Date.now() + idx;
    if (!createdAt) {
      const t = Date.parse(date);
      createdAt = isNaN(t) ? Date.now() + idx : t;
    }
    out.push({
      id: Number(id),
      createdAt: Number(createdAt),
      date: String(date),
      symbol: String(symbol || ""),
      avgEntry: String(avgEntry || ""),
      entry1: String(entry1 || ""),
      entry2: String(entry2 || ""),
      entry3: String(entry3 || ""),
      quantity: String(quantity || ""),
      pnl: String(pnl || ""),
      pnlPercent: String(pnlPercent || ""),
      reason: String(reason || ""),
      exitReason: String(exitReason || ""),
      lesson: String(lesson || ""),
    });
  });
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

/* 폼 리셋 */
function resetForm() {
  form.reset();
  document.getElementById("date").value = todayISO();
}

/* 시작 시 한 번 실행 */
function boot() {
  loadPrinciples();
  loadSettings();
  loadEntries();
  setRangePreset("ALL");
  autoOpenCalendars();
}
boot();
