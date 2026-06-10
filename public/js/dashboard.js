/**
 * ============================================================================
 * Dashboard JS — AHS Survey Admin Dashboard
 * Handles auth, data fetching, Chart.js rendering, KPI display, and NPS
 * ============================================================================
 */

// ── Global State ──
let currentDataset = 'demographics';
let selectedService = null;
let selectedAgeRange = null;
let selectedOccupation = null;
let cachedData = null;
let selectedKPIService = '';  // KPI section service filter
const charts = {};

// ── Service name mapping ──
const SERVICE_NAMES = {
  fitness: 'ฟิตเนสและซาวน่า',
  hydro: 'ธาราบำบัด',
  pt: 'กายภาพบำบัด',
};
const SERVICE_COLORS = {
  fitness: '#f59e0b',
  hydro: '#06b6d4',
  pt: '#10b981',
};

// ── Question Labels ──
const Q_LABELS = {
  q6_1: 'สะดวกนัดหมาย', q6_2: 'รวดเร็วนัดหมาย', q6_3: 'ยืดหยุ่นนัดหมาย',
  q7_1: 'สุภาพ/จิตบริการ', q7_2: 'เปิดโอกาสซักถาม', q7_3: 'อธิบายชัดเจน',
  q7_4: 'ความรู้/ทักษะ', q7_5: 'ประสิทธิภาพรักษา', q7_6: 'พึงพอใจภาพรวม',
  q8_1: 'สะดวกนัดหมาย', q8_2: 'รวดเร็วนัดหมาย', q8_3: 'ยืดหยุ่นนัดหมาย',
  q9_1: 'สุภาพ/จิตบริการ', q9_2: 'เปิดโอกาสซักถาม', q9_3: 'อธิบายชัดเจน', q9_4: 'พึงพอใจภาพรวม',
  q10_1: 'สะดวกนัดหมาย', q10_2: 'รวดเร็วนัดหมาย', q10_3: 'ยืดหยุ่นนัดหมาย',
  q11_1: 'สุภาพ/จิตบริการ', q11_2: 'เปิดโอกาสซักถาม', q11_3: 'อธิบายชัดเจน', q11_4: 'พึงพอใจภาพรวม',
  q12_1: 'สะอาด/ระเบียบ', q12_2: 'สะดวกเข้าถึง', q12_3: 'พร้อมอุปกรณ์',
  q12_4: 'สวยงาม', q12_5: 'บรรยากาศผ่อนคลาย', q12_6: 'เงียบสงบ/ส่วนตัว',
  q12_7: 'สุขอนามัย', q12_8: 'ปลอดภัย', q12_9: 'ดูแลฉุกเฉิน',
};

// ── Chart.js Plugin: Center Text ──
const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart) {
    const { ctx, chartArea } = chart;
    const meta = chart.options.plugins?.centerText;
    if (!meta || !meta.text) return;

    const centerX = (chartArea.left + chartArea.right) / 2;
    const isGauge = meta.gauge;
    const centerY = isGauge
      ? chartArea.bottom - 10
      : (chartArea.top + chartArea.bottom) / 2;

    ctx.save();
    // Main text
    ctx.textAlign = 'center';
    ctx.textBaseline = isGauge ? 'bottom' : 'middle';
    ctx.font = `bold ${meta.fontSize || 24}px Inter, sans-serif`;
    ctx.fillStyle = meta.color || '#e2e8f0';
    ctx.fillText(meta.text, centerX, centerY);

    // Sub text
    if (meta.subText) {
      ctx.font = `500 ${meta.subFontSize || 12}px Inter, sans-serif`;
      ctx.fillStyle = meta.subColor || '#94a3b8';
      ctx.fillText(meta.subText, centerX, centerY + (isGauge ? 18 : 22));
    }
    ctx.restore();
  },
};
Chart.register(centerTextPlugin);

// ============================================================================
// AUTHENTICATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('admin_auth') === 'true') {
    showDashboard();
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const pw = document.getElementById('loginPassword').value;
    if (!username || !pw) {
      document.getElementById('loginError').textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
      document.getElementById('loginError').classList.remove('hidden');
      return;
    }
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pw }),
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem('admin_auth', 'true');
        sessionStorage.setItem('admin_user', username);
        sessionStorage.setItem('admin_display', data.displayName || username);
        showDashboard();
      } else {
        document.getElementById('loginError').textContent = data.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
        document.getElementById('loginError').classList.remove('hidden');
      }
    } catch {
      document.getElementById('loginError').textContent = 'เกิดข้อผิดพลาด';
      document.getElementById('loginError').classList.remove('hidden');
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.removeItem('admin_auth');
    sessionStorage.removeItem('admin_user');
    sessionStorage.removeItem('admin_display');
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginModal').classList.remove('hidden');
  });

  // Mobile menu toggle
  document.getElementById('menuToggle').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    // backdrop
    let bd = document.getElementById('sidebarBackdrop');
    if (sidebar.classList.contains('open')) {
      if (!bd) {
        bd = document.createElement('div');
        bd.id = 'sidebarBackdrop';
        bd.className = 'sidebar-backdrop lg:hidden';
        bd.onclick = () => {
          sidebar.classList.remove('open');
          bd.remove();
        };
        document.body.appendChild(bd);
      }
    } else if (bd) {
      bd.remove();
    }
  });

  // New filter event listeners
  document.getElementById('filter-dateFrom')?.addEventListener('change', () => fetchStats().then(d => { cachedData = d; renderCurrentDataset(); }));
  document.getElementById('filter-dateTo')?.addEventListener('change', () => fetchStats().then(d => { cachedData = d; renderCurrentDataset(); }));
  document.getElementById('filter-quarter')?.addEventListener('change', () => loadData());
  document.getElementById('filter-year')?.addEventListener('change', () => loadData());

  // Export Excel button handler
  document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    const params = new URLSearchParams();
    const service = selectedService;
    const ageRange = document.getElementById('filterAge')?.value;
    const occupation = document.getElementById('filterOccupation')?.value;
    const dateFrom = document.getElementById('filter-dateFrom')?.value;
    const dateTo = document.getElementById('filter-dateTo')?.value;
    const quarter = document.getElementById('filter-quarter')?.value;
    const year = document.getElementById('filter-year')?.value;
    if (service) params.append('service', service);
    if (ageRange) params.append('ageRange', ageRange);
    if (occupation) params.append('occupation', occupation);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    if (quarter) params.append('quarter', quarter);
    if (year) params.append('year', year);
    window.location.href = `/api/export/excel?${params.toString()}`;
  });

  // KPI Service Filter buttons
  document.querySelectorAll('.kpi-svc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.kpi-svc-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedKPIService = btn.dataset.kpiSvc || '';
      refreshKPI();
    });
  });
});

function showDashboard() {
  document.getElementById('loginModal').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');

  // Show admin display name in header
  const displayName = sessionStorage.getItem('admin_display') || 'ผู้ดูแลระบบ';
  const nameEl = document.getElementById('adminDisplayName');
  if (nameEl) nameEl.textContent = displayName;

  // Populate year dropdown
  const yearSelect = document.getElementById('filter-year');
  if (yearSelect) {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 5; y--) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y + (y >= 2500 ? '' : ' (' + (y + 543) + ')');
      yearSelect.appendChild(opt);
    }
  }

  loadData();
}

// ============================================================================
// DATA FETCHING
// ============================================================================
async function fetchStats() {
  const params = new URLSearchParams();
  if (selectedService) params.set('service', selectedService);
  if (selectedAgeRange) params.set('ageRange', selectedAgeRange);
  if (selectedOccupation) params.set('occupation', selectedOccupation);

  const dateFrom = document.getElementById('filter-dateFrom')?.value;
  const dateTo = document.getElementById('filter-dateTo')?.value;
  const quarter = document.getElementById('filter-quarter')?.value;
  const year = document.getElementById('filter-year')?.value;
  if (dateFrom) params.append('dateFrom', dateFrom);
  if (dateTo) params.append('dateTo', dateTo);
  if (quarter) params.append('quarter', quarter);
  if (year) params.append('year', year);

  const qs = params.toString();
  const url = '/api/stats' + (qs ? '?' + qs : '');
  const res = await fetch(url);
  return res.json();
}

async function loadData() {
  showLoading(true);
  try {
    cachedData = await fetchStats();
    document.getElementById('totalBadge').textContent = `${cachedData.total} รายการ`;
    populateOccupationFilter(cachedData);
    renderCurrentDataset();
  } catch (err) {
    console.error('Error loading data:', err);
  }
  showLoading(false);
}

function showLoading(show) {
  document.getElementById('loadingSpinner').classList.toggle('hidden', !show);
}

function populateOccupationFilter(data) {
  const sel = document.getElementById('filterOccupation');
  const currentVal = sel.value;
  // Keep first option
  while (sel.options.length > 1) sel.remove(1);
  if (data.occupationDistribution) {
    data.occupationDistribution.forEach((d) => {
      if (d.occupation) {
        const opt = document.createElement('option');
        opt.value = d.occupation;
        opt.textContent = d.occupation;
        sel.appendChild(opt);
      }
    });
  }
  sel.value = currentVal;
}

// ============================================================================
// NAVIGATION & FILTERS
// ============================================================================
function switchDataset(name) {
  currentDataset = name;
  // Update nav
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.dataset === name);
  });
  // Show/hide containers
  document.querySelectorAll('.dataset-container').forEach((el) => {
    el.classList.toggle('hidden', el.id !== `dataset-${name}`);
  });
  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  const bd = document.getElementById('sidebarBackdrop');
  if (bd) bd.remove();

  renderCurrentDataset();
}

function applyFilters() {
  selectedAgeRange = document.getElementById('filterAge').value || null;
  selectedOccupation = document.getElementById('filterOccupation').value || null;
  loadData();
}

function clearAllFilters() {
  selectedService = null;
  selectedAgeRange = null;
  selectedOccupation = null;
  document.getElementById('filterAge').value = '';
  document.getElementById('filterOccupation').value = '';
  const dateFrom = document.getElementById('filter-dateFrom');
  const dateTo = document.getElementById('filter-dateTo');
  const quarter = document.getElementById('filter-quarter');
  const year = document.getElementById('filter-year');
  if (dateFrom) dateFrom.value = '';
  if (dateTo) dateTo.value = '';
  if (quarter) quarter.value = '';
  if (year) year.value = '';
  document.getElementById('serviceFilterStatus').classList.add('hidden');
  loadData();
}

function setServiceFilter(service) {
  if (selectedService === service) {
    selectedService = null;
    document.getElementById('serviceFilterStatus').classList.add('hidden');
  } else {
    selectedService = service;
    document.getElementById('serviceFilterName').textContent = SERVICE_NAMES[service] || service;
    document.getElementById('serviceFilterStatus').classList.remove('hidden');
  }
  loadData();
}

function clearServiceFilter() {
  selectedService = null;
  document.getElementById('serviceFilterStatus').classList.add('hidden');
  loadData();
}

// ============================================================================
// CHART MANAGEMENT
// ============================================================================
function destroyAllCharts() {
  Object.keys(charts).forEach((k) => {
    if (charts[k]) { charts[k].destroy(); delete charts[k]; }
  });
}

function renderCurrentDataset() {
  destroyAllCharts();
  if (!cachedData) return;

  switch (currentDataset) {
    case 'demographics': renderDemographics(cachedData); break;
    case 'satisfaction': renderSatisfaction(cachedData); break;
    case 'expectations': renderExpectations(cachedData); break;
    case 'kpi': renderKPIOverview(cachedData); break;
  }
}

// ============================================================================
// DATASET 1: DEMOGRAPHICS
// ============================================================================
function renderDemographics(data) {
  renderAgeChart(data);
  renderOccupationChart(data);
  renderNewsSourceChart(data);
}

function renderAgeChart(data) {
  const ctx = document.getElementById('chartAge');
  if (!ctx) return;
  const ages = data.ageDistribution || [];
  charts.age = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ages.map((a) => a.range),
      datasets: [{
        label: 'จำนวน (คน)',
        data: ages.map((a) => a.count),
        backgroundColor: 'rgba(20,184,166,0.7)',
        borderColor: '#14b8a6',
        borderWidth: 1, borderRadius: 6, maxBarThickness: 50,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#1e293b', titleColor: '#e2e8f0', bodyColor: '#94a3b8', borderColor: '#334155', borderWidth: 1 },
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: 'rgba(51,65,85,0.3)' } },
      },
    },
  });
}

function renderOccupationChart(data) {
  const ctx = document.getElementById('chartOccupation');
  if (!ctx) return;
  const items = data.occupationPercentage || data.occupationDistribution || [];
  const palette = ['#14b8a6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#64748b', '#ec4899'];

  charts.occupation = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: items.map((d) => d.occupation || 'ไม่ระบุ'),
      datasets: [{
        data: items.map((d) => d.count),
        backgroundColor: items.map((_, i) => palette[i % palette.length]),
        borderColor: '#1e293b', borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        centerText: { text: String(data.total || 0), subText: 'ทั้งหมด', fontSize: 28, color: '#e2e8f0' },
        legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12, padding: 8, font: { size: 10 } } },
        tooltip: {
          backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1,
          callbacks: {
            label: (ctx) => {
              const pct = items[ctx.dataIndex]?.percentage ?? ((ctx.raw / (data.total || 1)) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.raw} คน (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function renderNewsSourceChart(data) {
  const ctx = document.getElementById('chartNewsSource');
  if (!ctx) return;
  const items = data.newsSourcePercentage || data.newsSourceDistribution || [];

  // Top 3 colors: gold, silver, bronze; rest gray
  const top3Colors = ['rgba(245,158,11,0.85)', 'rgba(148,163,184,0.75)', 'rgba(180,83,9,0.7)'];
  const top3Borders = ['#f59e0b', '#94a3b8', '#b45309'];
  const bgColors = items.map((_, i) => i < 3 ? top3Colors[i] : 'rgba(51,65,85,0.5)');
  const borderColors = items.map((_, i) => i < 3 ? top3Borders[i] : '#334155');

  charts.newsSource = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: items.map((d, i) => {
        const rank = i < 3 ? ['🥇', '🥈', '🥉'][i] + ' ' : '';
        return rank + d.source;
      }),
      datasets: [{
        label: 'จำนวน',
        data: items.map((d) => d.count),
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1, borderRadius: 4, maxBarThickness: 30,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: '📊 ช่องทางข่าวสาร (Top 3 = เหรียญ)',
          color: '#94a3b8',
          font: { size: 11 },
          align: 'start',
          padding: { bottom: 8 },
        },
        tooltip: {
          backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1,
          callbacks: {
            label: (context) => {
              const pct = items[context.dataIndex]?.percentage ?? 0;
              const rank = context.dataIndex < 3 ? ` [อันดับ ${context.dataIndex + 1}]` : '';
              return ` ${context.raw} คน (${pct}%)${rank}`;
            },
          },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: 'rgba(51,65,85,0.3)' } },
        y: { ticks: { color: '#e2e8f0', font: { size: 10 } }, grid: { display: false } },
      },
    },
  });
}

// ============================================================================
// DATASET 2: SATISFACTION
// ============================================================================
function renderSatisfaction(data) {
  const label = selectedService ? `(${SERVICE_NAMES[selectedService]})` : '(ทุกแผนก)';
  document.getElementById('satisfactionFilterLabel').textContent = label;
  renderServiceDonut(data);
  renderWaitTimeEfficiency(data);
  renderSatisfactionGauge(data);
  renderScoreDistribution(data);
}

function renderServiceDonut(data) {
  const ctx = document.getElementById('chartServiceDonut');
  if (!ctx) return;
  const items = data.servicePercentage || data.serviceDistribution || [];
  const labels = items.map((d) => SERVICE_NAMES[d.service_type] || d.service_type);
  const colors = items.map((d) => SERVICE_COLORS[d.service_type] || '#64748b');

  charts.serviceDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: items.map((d) => d.count),
        backgroundColor: colors.map((c) => c + 'cc'),
        borderColor: '#1e293b', borderWidth: 2,
        hoverBackgroundColor: colors,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        centerText: {
          text: selectedService ? SERVICE_NAMES[selectedService] : String(data.total || 0),
          subText: selectedService ? 'กรองแล้ว' : 'ทั้งหมด',
          fontSize: selectedService ? 16 : 28,
        },
        legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12, padding: 8, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pct = items[ctx.dataIndex]?.percentage ?? 0;
              return ` ${ctx.label}: ${ctx.raw} คน (${pct}%)`;
            },
          },
        },
      },
      onClick: (_event, elements) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          const svc = items[idx]?.service_type;
          if (svc) setServiceFilter(svc);
        }
      },
    },
  });
}

function renderWaitTimeEfficiency(data) {
  const ctx = document.getElementById('chartWaitEfficiency');
  if (!ctx) return;
  const wte = data.waitTimeEfficiency || {};
  const departments = selectedService
    ? [selectedService]
    : ['fitness', 'hydro', 'pt'];
  const labelsArr = [...departments.map((d) => SERVICE_NAMES[d]), 'ภาพรวม'];
  const dataArr = [...departments.map((d) => wte[d]?.percentage || 0), wte.overall?.percentage || 0];
  const colorsArr = [...departments.map((d) => SERVICE_COLORS[d] + 'cc'), 'rgba(148,163,184,0.7)'];

  charts.waitEfficiency = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labelsArr,
      datasets: [{
        label: '% รอ < 15 นาที',
        data: dataArr,
        backgroundColor: colorsArr,
        borderRadius: 6, maxBarThickness: 60,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.raw.toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, max: 100, ticks: { color: '#94a3b8', callback: (v) => v + '%' }, grid: { color: 'rgba(51,65,85,0.3)' } },
      },
    },
  });
}

function renderSatisfactionGauge(data) {
  const ctx = document.getElementById('chartSatisfactionGauge');
  if (!ctx) return;
  const osm = data.overallSatisfactionMean || {};
  const source = selectedService ? osm[selectedService] : osm.overall;
  const mean = source?.mean ?? 0;
  const pct = source?.percentage ?? 0;

  let gaugeColor = '#ef4444'; // red
  let levelText = 'ต้องปรับปรุง';
  if (mean > 4) { gaugeColor = '#22c55e'; levelText = 'ดีมาก'; }
  else if (mean > 3) { gaugeColor = '#eab308'; levelText = 'ดี'; }
  else if (mean > 2) { gaugeColor = '#f97316'; levelText = 'ปานกลาง'; }

  charts.satisfactionGauge = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [mean, 5 - mean],
        backgroundColor: [gaugeColor, 'rgba(51,65,85,0.3)'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      circumference: 180, rotation: -90, cutout: '75%',
      layout: { padding: { bottom: 30 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
    },
  });

  // Update HTML overlay text instead of canvas-drawn text
  const mainEl = document.getElementById('gaugeMainText');
  const subEl = document.getElementById('gaugeSubText');
  if (mainEl) { mainEl.textContent = mean.toFixed(2) + ' / 5'; mainEl.style.color = gaugeColor; }
  if (subEl) { subEl.textContent = pct.toFixed(1) + '%'; }

  document.getElementById('satisfactionLevel').textContent = `ระดับ: ${levelText}`;
  document.getElementById('satisfactionLevel').style.color = gaugeColor;
}

function renderScoreDistribution(data) {
  const ctx = document.getElementById('chartScoreDistribution');
  if (!ctx) return;
  const sa = data.satisfactionAvg || {};

  // Determine question order based on service
  let qKeys = [];
  if (selectedService === 'pt') {
    qKeys = ['q6_1','q6_2','q6_3','q7_1','q7_2','q7_3','q7_4','q7_5','q7_6'];
  } else if (selectedService === 'fitness') {
    qKeys = ['q8_1','q8_2','q8_3','q9_1','q9_2','q9_3','q9_4'];
  } else if (selectedService === 'hydro') {
    qKeys = ['q10_1','q10_2','q10_3','q11_1','q11_2','q11_3','q11_4'];
  }
  // Always add section 5 (facilities)
  qKeys = [...qKeys, 'q12_1','q12_2','q12_3','q12_4','q12_5','q12_6','q12_7','q12_8','q12_9'];

  // Filter to only questions that have data
  qKeys = qKeys.filter((k) => sa[k] !== undefined && sa[k] !== null);

  const labels = qKeys.map((k) => Q_LABELS[k] || k);
  const avgValues = qKeys.map((k) => {
    const val = sa[k];
    return typeof val === 'object' ? (val.avg || 0) : (val || 0);
  });

  // Color each bar based on its average value
  function getBarColor(val) {
    if (val >= 4.5) return 'rgba(22, 163, 74, 0.85)';   // green-600
    if (val >= 4.0) return 'rgba(34, 197, 94, 0.85)';   // green-500
    if (val >= 3.5) return 'rgba(132, 204, 22, 0.85)';  // lime-500
    if (val >= 3.0) return 'rgba(234, 179, 8, 0.85)';   // yellow-500
    if (val >= 2.0) return 'rgba(249, 115, 22, 0.85)';  // orange-500
    return 'rgba(239, 68, 68, 0.85)';                    // red-500
  }

  function getBorderColor(val) {
    if (val >= 4.5) return '#16a34a';
    if (val >= 4.0) return '#22c55e';
    if (val >= 3.5) return '#84cc16';
    if (val >= 3.0) return '#eab308';
    if (val >= 2.0) return '#f97316';
    return '#ef4444';
  }

  const bgColors = avgValues.map(v => getBarColor(v));
  const borderColors = avgValues.map(v => getBorderColor(v));

  charts.scoreDistribution = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'คะแนนเฉลี่ย',
        data: avgValues,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.7,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 35 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const val = context.raw;
              let level = '';
              if (val >= 4.5) level = 'ดีมาก';
              else if (val >= 3.5) level = 'ดี';
              else if (val >= 2.5) level = 'ปานกลาง';
              else if (val >= 1.5) level = 'ต้องปรับปรุง';
              else level = 'ต้องปรับปรุงเร่งด่วน';
              return ` คะแนนเฉลี่ย: ${val.toFixed(2)} / 5  (${level})`;
            },
          },
        },
      },
      scales: {
        x: {
          min: 0,
          max: 5,
          ticks: {
            color: '#94a3b8',
            stepSize: 1,
            callback: (v) => v.toFixed(0),
          },
          grid: { color: 'rgba(51,65,85,0.3)' },
          title: {
            display: true,
            text: 'คะแนนเฉลี่ย (เต็ม 5)',
            color: '#94a3b8',
            font: { size: 11 },
          },
        },
        y: {
          ticks: { color: '#e2e8f0', font: { size: 10 } },
          grid: { display: false },
        },
      },
      // Data labels plugin (inline via animation callback)
      animation: {
        onComplete: function() {
          const chart = this;
          const ctxDraw = chart.ctx;
          ctxDraw.save();
          ctxDraw.font = 'bold 10px Inter, sans-serif';
          ctxDraw.fillStyle = '#e2e8f0';
          ctxDraw.textAlign = 'left';
          ctxDraw.textBaseline = 'middle';
          chart.data.datasets[0].data.forEach((val, i) => {
            const meta = chart.getDatasetMeta(0);
            const bar = meta.data[i];
            if (bar) {
              ctxDraw.fillText(val.toFixed(2), bar.x + 6, bar.y);
            }
          });
          ctxDraw.restore();
        },
      },
    },
  });
}

// ============================================================================
// DATASET 3: EXPECTATIONS & NPS
// ============================================================================
function renderExpectations(data) {
  renderExpectationComparison(data);
  renderRecommendationGauges(data);
  renderNPSCard(data);
  renderFeedbackList(data);
}

function renderExpectationComparison(data) {
  const ctx = document.getElementById('chartExpectation');
  if (!ctx) return;
  const ec = data.expectationComparison || {};
  const beforeAvg = ec.before?.avg ?? 0;
  const afterAvg = ec.after?.avg ?? 0;

  charts.expectation = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['ความคาดหวัง'],
      datasets: [
        {
          label: 'ก่อนรับบริการ (Q15)',
          data: [beforeAvg],
          backgroundColor: 'rgba(59,130,246,0.7)',
          borderColor: '#3b82f6', borderWidth: 1, borderRadius: 6, maxBarThickness: 60,
        },
        {
          label: 'หลังรับบริการ (Q16)',
          data: [afterAvg],
          backgroundColor: 'rgba(34,197,94,0.7)',
          borderColor: '#22c55e', borderWidth: 1, borderRadius: 6, maxBarThickness: 60,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12 } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(2)}` } },
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        y: { beginAtZero: true, max: 10, ticks: { color: '#94a3b8', stepSize: 2 }, grid: { color: 'rgba(51,65,85,0.3)' } },
      },
    },
  });
}

function renderRecommendationGauges(data) {
  const ra = data.recommendationAvg || {};
  const recAvg = ra.recommend?.avg ?? 0;
  const reuseAvg = ra.reuse?.avg ?? 0;

  renderSingleGauge('chartRecommendGauge', recAvg, 10, 'recommend', 'recommendOverlay');
  renderSingleGauge('chartReuseGauge', reuseAvg, 10, 'reuse', 'reuseOverlay');
}

function renderSingleGauge(canvasId, value, max, key, overlayId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  let color = '#ef4444';
  if (value > 8) color = '#22c55e';
  else if (value > 6) color = '#eab308';
  else if (value > 4) color = '#f97316';

  charts[key] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [value, max - value],
        backgroundColor: [color, 'rgba(51,65,85,0.3)'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      circumference: 180, rotation: -90, cutout: '70%',
      layout: { padding: { bottom: 20 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
    },
  });

  // Update HTML overlay text
  if (overlayId) {
    const overlay = document.getElementById(overlayId);
    if (overlay) {
      const mainScore = overlay.querySelector('.gauge-main-score');
      if (mainScore) { mainScore.textContent = value.toFixed(1); mainScore.style.color = color; }
    }
  }
}

function renderNPSCard(data) {
  const nps = data.nps || {};
  const npsScore = nps.nps ?? null;
  const scoreEl = document.getElementById('npsScore');
  const labelEl = document.getElementById('npsLabel');
  const breakdownEl = document.getElementById('npsBreakdown');
  const totalEl = document.getElementById('npsTotalResponses');

  if (npsScore === null || nps.totalResponses === 0) {
    scoreEl.textContent = '—';
    scoreEl.style.color = '#94a3b8';
    labelEl.textContent = 'ยังไม่มีข้อมูล';
    labelEl.style.color = '#94a3b8';
    breakdownEl.innerHTML = '';
    totalEl.textContent = '';
    return;
  }

  // NPS color
  let color = '#ef4444', label = 'ต้องปรับปรุง';
  if (npsScore > 50) { color = '#22c55e'; label = 'ยอดเยี่ยม (Excellent)'; }
  else if (npsScore > 0) { color = '#86efac'; label = 'ดี (Good)'; }
  else if (npsScore === 0) { color = '#eab308'; label = 'ปานกลาง (Neutral)'; }

  scoreEl.textContent = npsScore.toFixed(0);
  scoreEl.style.color = color;
  labelEl.textContent = label;
  labelEl.style.color = color;
  totalEl.textContent = `จากผู้ตอบ ${nps.totalResponses} คน`;

  // Breakdown bars
  const groups = [
    { key: 'promoters', label: 'Promoters (9-10)', color: '#22c55e', bg: 'rgba(34,197,94,0.2)' },
    { key: 'passives', label: 'Passives (7-8)', color: '#eab308', bg: 'rgba(234,179,8,0.2)' },
    { key: 'detractors', label: 'Detractors (0-6)', color: '#ef4444', bg: 'rgba(239,68,68,0.2)' },
  ];

  breakdownEl.innerHTML = groups.map((g) => {
    const d = nps[g.key] || { count: 0, percentage: 0 };
    return `
      <div>
        <div class="flex justify-between text-xs mb-1">
          <span style="color:${g.color}">${g.label}</span>
          <span class="text-gray-400">${d.count} คน (${d.percentage.toFixed(1)}%)</span>
        </div>
        <div class="w-full h-2 rounded-full" style="background:${g.bg}">
          <div class="nps-bar" style="width:${d.percentage}%;background:${g.color}"></div>
        </div>
      </div>`;
  }).join('');
}

function renderFeedbackList(data) {
  const list = document.getElementById('feedbackList');
  const feedback = data.recentFeedback || [];

  if (feedback.length === 0) {
    list.innerHTML = '<p class="text-gray-500 text-sm">ยังไม่มีข้อเสนอแนะ</p>';
    return;
  }

  list.innerHTML = feedback
    .filter((f) => f.q13 || f.q17 || f.q18)
    .map((f) => {
      const svc = f.service_type || 'unknown';
      const svcName = SERVICE_NAMES[svc] || svc;
      const texts = [];
      if (f.q13) texts.push(`<p class="text-gray-300 text-sm">${escapeHtml(f.q13)}</p>`);
      if (f.q17) texts.push(`<p class="text-gray-400 text-xs mt-1">✨ ${escapeHtml(f.q17)}</p>`);
      if (f.q18) texts.push(`<p class="text-teal-400 text-xs mt-1">🔧 ต้องการเพิ่มเติม: ${escapeHtml(f.q18)}</p>`);
      return `
        <div class="feedback-item">
          <div class="flex items-center justify-between mb-1">
            <span class="service-tag ${svc}">${svcName}</span>
            <span class="text-xs text-gray-600">${f.created_at || ''}</span>
          </div>
          ${texts.join('')}
        </div>`;
    }).join('') || '<p class="text-gray-500 text-sm">ยังไม่มีข้อเสนอแนะ</p>';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================================
// DATASET 4: KPI OVERVIEW
// ============================================================================

/**
 * Fetch stats filtered by KPI service selection, then re-render KPI cards.
 */
async function refreshKPI() {
  try {
    const params = new URLSearchParams();
    if (selectedKPIService) params.set('service', selectedKPIService);

    // Also carry over date/quarter/year filters
    const dateFrom = document.getElementById('filter-dateFrom')?.value;
    const dateTo = document.getElementById('filter-dateTo')?.value;
    const quarter = document.getElementById('filter-quarter')?.value;
    const year = document.getElementById('filter-year')?.value;
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    if (quarter) params.append('quarter', quarter);
    if (year) params.append('year', year);

    const qs = params.toString();
    const url = '/api/stats' + (qs ? '?' + qs : '');
    const res = await fetch(url);
    const kpiData = await res.json();
    renderKPIOverview(kpiData);
  } catch (err) {
    console.error('Error refreshing KPI:', err);
  }
}

function renderKPIOverview(data) {
  const svcLabel = selectedKPIService
    ? { pt: 'กายภาพบำบัด', fitness: 'ฟิตเนสและซาวน่า', hydro: 'ธาราบำบัด' }[selectedKPIService]
    : 'ทุกบริการ';
  const osm = data.overallSatisfactionMean || {};
  const wte = data.waitTimeEfficiency || {};
  const nps = data.nps || {};
  const ra = data.recommendationAvg || {};
  const nsp = data.newsSourcePercentage || [];
  const sa = data.satisfactionAvg || {};

  // Helper: set score, bar, detail
  function setKPI(prefix, scoreText, scoreColor, barPct, barColor, detailText) {
    const s = document.getElementById(prefix + '-score');
    const b = document.getElementById(prefix + '-bar');
    const d = document.getElementById(prefix + '-detail');
    if (s) { s.textContent = scoreText; s.style.color = scoreColor; }
    if (b) { b.style.width = Math.min(barPct, 100) + '%'; if (barColor) b.style.background = barColor; }
    if (d) { d.textContent = detailText; }
  }

  function scoreColor(val, good, mid) {
    if (val > good) return '#22c55e';
    if (val > mid) return '#eab308';
    return '#ef4444';
  }
  function barGrad(val, good, mid) {
    if (val > good) return 'linear-gradient(90deg,#14b8a6,#22c55e)';
    if (val > mid) return 'linear-gradient(90deg,#eab308,#f59e0b)';
    return 'linear-gradient(90deg,#ef4444,#f97316)';
  }

  // ═══════════════════════════════════
  // หมวด 7.1n — ผลลัพธ์ด้านการให้บริการ
  // ═══════════════════════════════════

  // 7.1-8: จำนวนผู้เข้ารับบริการรายใหม่
  const total = data.total || 0;
  const sd = data.serviceDistribution || [];
  const fitCount = sd.find(d => d.service_type === 'fitness')?.count || 0;
  const hydCount = sd.find(d => d.service_type === 'hydro')?.count || 0;
  const ptCount = sd.find(d => d.service_type === 'pt')?.count || 0;
  const detailText71_8 = selectedKPIService
    ? `${svcLabel}: ${total} คน`
    : `PT: ${ptCount} | Fitness: ${fitCount} | Hydro: ${hydCount}`;
  setKPI('kpi-71-8',
    total + ' คน',
    '#22d3ee',
    0, null,
    detailText71_8
  );

  // 7.1-9: ผลประเมินความพึงพอใจผู้รับบริการ (แยกแผนก)
  const ptMean = osm.pt?.mean || 0;
  const fitMean = osm.fitness?.mean || 0;
  const hydMean = osm.hydro?.mean || 0;
  const ptPct = osm.pt?.percentage || 0;
  const fitPct = osm.fitness?.percentage || 0;
  const hydPct = osm.hydro?.percentage || 0;
  const avgDeptMean = total > 0 ? ((ptMean * ptCount + fitMean * fitCount + hydMean * hydCount) / (total || 1)) : 0;
  setKPI('kpi-71-9',
    (osm.overall?.mean || 0).toFixed(2) + ' / 5',
    scoreColor(osm.overall?.mean || 0, 4, 3),
    osm.overall?.percentage || 0,
    barGrad(osm.overall?.mean || 0, 4, 3),
    `PT: ${ptMean.toFixed(2)} (${ptPct.toFixed(0)}%) | Fitness: ${fitMean.toFixed(2)} (${fitPct.toFixed(0)}%) | Hydro: ${hydMean.toFixed(2)} (${hydPct.toFixed(0)}%)`
  );

  // 7.1-29: ระยะเวลารอรับบริการ (% < 15 นาที)
  const waitOverall = wte.overall || { percentage: 0, under15: 0, total: 0 };
  setKPI('kpi-71-29',
    waitOverall.percentage.toFixed(1) + '%',
    scoreColor(waitOverall.percentage, 70, 50),
    waitOverall.percentage,
    barGrad(waitOverall.percentage, 70, 50),
    `ผู้รับบริการรอ <15 นาที: ${waitOverall.under15 || 0}/${waitOverall.total || 0} คน`
  );

  // 7.1-31: คะแนนความพึงพอใจผู้รับบริการสุขภาพ (ภาพรวม = 7.1-9 รวม)
  const overallMean = osm.overall?.mean || 0;
  const overallPct = osm.overall?.percentage || 0;
  setKPI('kpi-71-31',
    overallMean.toFixed(2) + ' / 5',
    scoreColor(overallMean, 4, 3),
    overallPct,
    barGrad(overallMean, 4, 3),
    `คิดเป็น ${overallPct.toFixed(1)}% — ${svcLabel}`
  );

  // 7.1-33: อัตราการกลับรับบริการซ้ำ (จาก Q20 score ≥ 7 ถือว่ามีแนวโน้มกลับมา)
  const reuseAvg = ra.reuse?.avg || 0;
  const reusePct = (reuseAvg / 10) * 100;
  setKPI('kpi-71-33',
    reuseAvg.toFixed(1) + ' / 10',
    scoreColor(reuseAvg, 8, 6),
    reusePct,
    barGrad(reuseAvg, 8, 6),
    `Q20 เฉลี่ย: ${reuseAvg.toFixed(2)} (${ra.reuse?.count || 0} คนตอบ)`
  );

  // ═══════════════════════════════════
  // หมวด 7.2n(1) — ความพึงพอใจลูกค้า
  // ═══════════════════════════════════

  // 7.2-20: ความพึงพอใจด้านสถานที่ (q12_1-q12_9)
  const q12Keys = ['q12_1','q12_2','q12_3','q12_4','q12_5','q12_6','q12_7','q12_8','q12_9'];
  let q12Sum = 0, q12Count = 0;
  q12Keys.forEach(k => {
    if (sa[k] !== undefined && sa[k] !== null) { q12Sum += sa[k]; q12Count++; }
  });
  const q12Mean = q12Count > 0 ? q12Sum / q12Count : 0;
  const q12Pct = (q12Mean / 5) * 100;
  setKPI('kpi-72-20',
    q12Mean.toFixed(2) + ' / 5',
    scoreColor(q12Mean, 4, 3),
    q12Pct,
    barGrad(q12Mean, 4, 3),
    `คิดเป็น ${q12Pct.toFixed(1)}% (เฉลี่ย q12: 9 ข้อ สถานที่/ความปลอดภัย)`
  );

  // 7.2-21: ความพึงพอใจต่อบริการ (service-specific q6-q11)
  const svcQKeys = {
    pt: ['q6_1','q6_2','q6_3','q7_1','q7_2','q7_3','q7_4','q7_5','q7_6'],
    fitness: ['q8_1','q8_2','q8_3','q9_1','q9_2','q9_3','q9_4'],
    hydro: ['q10_1','q10_2','q10_3','q11_1','q11_2','q11_3','q11_4'],
  };
  let svcSum = 0, svcCount = 0;
  Object.values(svcQKeys).flat().forEach(k => {
    if (sa[k] !== undefined && sa[k] !== null) { svcSum += sa[k]; svcCount++; }
  });
  const svcMean = svcCount > 0 ? svcSum / svcCount : 0;
  const svcPct = (svcMean / 5) * 100;
  setKPI('kpi-72-21',
    svcMean.toFixed(2) + ' / 5',
    scoreColor(svcMean, 4, 3),
    svcPct,
    barGrad(svcMean, 4, 3),
    `คิดเป็น ${svcPct.toFixed(1)}% (เฉลี่ยคำถามเฉพาะแผนก q6-q11)`
  );

  // 7.2-22: ร้อยละความพึงพอใจภาพรวม
  setKPI('kpi-72-22',
    overallPct.toFixed(1) + '%',
    scoreColor(overallPct, 80, 60),
    overallPct,
    barGrad(overallPct, 80, 60),
    `(Mean ${overallMean.toFixed(2)} / 5) × 100 จากทุกข้อ ทุกแผนก`
  );

  // ═══════════════════════════════════
  // หมวด 7.2n(2),(3) — กลับใช้/บอกต่อ/NPS
  // ═══════════════════════════════════

  // 7.2-28: ผู้รับบริการรายใหม่ (= total responses ในช่วงเวลา)
  setKPI('kpi-72-28',
    total + ' คน',
    '#22d3ee',
    0, null,
    `จำนวนผู้ตอบแบบสำรวจทั้งหมดในช่วงเวลาที่เลือก`
  );

  // 7.2-33: สัดส่วนกลับใช้ซ้ำ (Q20 >= 7 → มีแนวโน้ม)
  setKPI('kpi-72-33',
    reuseAvg.toFixed(1) + ' / 10',
    scoreColor(reuseAvg, 8, 6),
    reusePct,
    barGrad(reuseAvg, 8, 6),
    `Q20 แนวโน้มใช้บริการใหม่ (${ra.reuse?.count || 0} คนตอบ)`
  );

  // 7.2-34: NPS — ร้อยละการบอกต่อ
  const npsVal = nps.nps || 0;
  const npsBarPct = Math.max(0, Math.min(100, (npsVal + 100) / 2));
  setKPI('kpi-72-34',
    'NPS: ' + (npsVal > 0 ? '+' : '') + npsVal.toFixed(0),
    npsVal > 50 ? '#22c55e' : npsVal > 0 ? '#86efac' : npsVal === 0 ? '#eab308' : '#ef4444',
    npsBarPct,
    npsVal > 50 ? 'linear-gradient(90deg,#14b8a6,#22c55e)' : npsVal > 0 ? 'linear-gradient(90deg,#86efac,#22c55e)' : 'linear-gradient(90deg,#ef4444,#f97316)',
    `Promoters: ${(nps.promoters?.percentage || 0).toFixed(0)}% | Passives: ${(nps.passives?.percentage || 0).toFixed(0)}% | Detractors: ${(nps.detractors?.percentage || 0).toFixed(0)}% | Q19 เฉลี่ย: ${(ra.recommend?.avg || 0).toFixed(1)}/10`
  );

  // ═══════════════════════════════════
  // หมวด 7.4 — การรับรู้ข่าวสาร
  // ═══════════════════════════════════

  // 7.4-10a: ความพึงพอใจต่อบริการสุขภาพโดยผู้รับบริการ (= overall satisfaction)
  setKPI('kpi-74-10a',
    overallMean.toFixed(2) + ' / 5',
    scoreColor(overallMean, 4, 3),
    overallPct,
    barGrad(overallMean, 4, 3),
    `ความพึงพอใจภาพรวม ${overallPct.toFixed(1)}% (รวมทุกแผนก)`
  );

  // 7.4-13: ระดับการรับรู้ข้อมูลข่าวสาร
  const topSource = nsp.length > 0 ? nsp[0] : { percentage: 0, source: '—' };
  const channelCount = nsp.length;
  setKPI('kpi-74-13',
    channelCount + ' ช่องทาง',
    channelCount >= 5 ? '#22c55e' : channelCount >= 3 ? '#eab308' : '#ef4444',
    Math.min(channelCount * 15, 100),
    channelCount >= 5 ? 'linear-gradient(90deg,#14b8a6,#22c55e)' : 'linear-gradient(90deg,#eab308,#f59e0b)',
    `ช่องทางหลัก: ${topSource.source} (${topSource.percentage?.toFixed(1) || 0}%) | ผู้ตอบ: ${total} คน`
  );

  // 7.4-14: ความพึงพอใจต่อสื่อ/ช่องทางรับข่าวสาร
  // ใช้ข้อมูลจาก Q14 diversity — ยิ่งหลากหลายยิ่งดี
  const avgChannelsPerPerson = total > 0 ? (nsp.reduce((sum, s) => sum + (s.count || 0), 0) / total) : 0;
  const channelSatPct = Math.min(avgChannelsPerPerson * 50, 100); // scale
  setKPI('kpi-74-14',
    topSource.percentage?.toFixed(1) + '%',
    scoreColor(topSource.percentage || 0, 30, 15),
    topSource.percentage || 0,
    barGrad(topSource.percentage || 0, 30, 15),
    `ช่องทางที่ผู้รับบริการรู้จักมากที่สุด: ${topSource.source}`
  );
}
