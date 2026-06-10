/**
 * seed-data.js — สร้างข้อมูลจำลองแบบสำรวจทั้งปี
 * ครอบคลุม: 2025 Q1-Q4 + 2026 Q1-Q2
 * รวมประมาณ 300-400 รายการ
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'survey.db'));

// ── Config ──
const SERVICES = ['pt', 'fitness', 'hydro'];
const GENDERS = ['ชาย', 'หญิง', 'ไม่ระบุ'];
const OCCUPATIONS = ['นิสิต/นักศึกษา', 'บุคลากร มน.', 'ข้าราชการ/พนักงานรัฐ', 'พนักงานเอกชน', 'ธุรกิจส่วนตัว', 'เกษตรกร', 'ผู้สูงอายุ/เกษียณ'];
const WAIT_TIMES = ['น้อยกว่า 15 นาที', '15-30 นาที', '30-60 นาที', 'มากกว่า 60 นาที'];
const NEWS_SOURCES = ['เว็บไซต์', 'Facebook', 'Line', 'เพื่อน/ญาติแนะนำ', 'ป้ายประชาสัมพันธ์', 'แพทย์/พยาบาลส่ง'];

const IMPRESSIONS = [
  'บริการดีมาก เจ้าหน้าที่ใจดี',
  'สถานที่สะอาด อุปกรณ์ทันสมัย',
  'รอนานไปนิด แต่โดยรวมดี',
  'อยากให้เพิ่มเวลาให้บริการ',
  'ประทับใจมาก จะกลับมาใช้อีก',
  'อยากให้มีที่จอดรถเพิ่ม',
  'เจ้าหน้าที่อธิบายชัดเจนดีมาก',
  'บรรยากาศดี ผ่อนคลาย',
  'อุปกรณ์บางชิ้นเก่า ควรเปลี่ยน',
  'ราคาเหมาะสม คุ้มค่า',
  'อยากให้เปิดวันเสาร์-อาทิตย์ด้วย',
  'พนักงานสุภาพ มีน้ำใจ',
  null, null, null,  // some null for realism
];

const SUGGESTIONS = [
  'อยากให้เปิดบริการช่วงเย็นด้วย',
  'เพิ่มจำนวนเจ้าหน้าที่',
  'ปรับปรุงห้องน้ำ',
  'เพิ่มอุปกรณ์ออกกำลังกาย',
  'ทำระบบนัดหมายออนไลน์',
  'เพิ่มพื้นที่จอดรถ',
  null, null, null, null,
];

// ── Helpers ──
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function weightedScore(base) {
  // Generate score 1-5 with weight toward `base`
  const r = Math.random();
  if (r < 0.4) return base;
  if (r < 0.65) return Math.min(5, base + 1);
  if (r < 0.85) return Math.max(1, base - 1);
  if (r < 0.95) return Math.min(5, base + 2);
  return Math.max(1, base - 2);
}

function randomDate(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const day = randInt(1, daysInMonth);
  const hour = randInt(8, 17);
  const min = randInt(0, 59);
  const sec = randInt(0, 59);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ── Get column list ──
const columns = db.prepare("PRAGMA table_info(responses)").all().map(c => c.name).filter(c => c !== 'id');

// ── Build insert ──
const placeholders = columns.map(() => '?').join(', ');
const insertStmt = db.prepare(`INSERT INTO responses (${columns.join(', ')}) VALUES (${placeholders})`);

// ── Generate Data ──
const insertMany = db.transaction((records) => {
  for (const rec of records) {
    const values = columns.map(col => rec[col] !== undefined ? rec[col] : null);
    insertStmt.run(...values);
  }
});

const records = [];

// Generate data for 2025 (Q1-Q4) + 2026 (Q1-Q2)
const monthConfigs = [
  // 2025: full year
  { year: 2025, month: 1, count: 18 },
  { year: 2025, month: 2, count: 22 },
  { year: 2025, month: 3, count: 20 },
  { year: 2025, month: 4, count: 15 },
  { year: 2025, month: 5, count: 25 },
  { year: 2025, month: 6, count: 28 },
  { year: 2025, month: 7, count: 20 },
  { year: 2025, month: 8, count: 22 },
  { year: 2025, month: 9, count: 18 },
  { year: 2025, month: 10, count: 24 },
  { year: 2025, month: 11, count: 26 },
  { year: 2025, month: 12, count: 15 },
  // 2026: Q1-Q2
  { year: 2026, month: 1, count: 22 },
  { year: 2026, month: 2, count: 28 },
  { year: 2026, month: 3, count: 25 },
  { year: 2026, month: 4, count: 20 },
  { year: 2026, month: 5, count: 30 },
  { year: 2026, month: 6, count: 18 },
];

for (const { year, month, count } of monthConfigs) {
  for (let i = 0; i < count; i++) {
    const service = pick(SERVICES);
    const baseScore = randInt(3, 5); // tend toward good scores
    const age = randInt(18, 75);
    const gender = pick(GENDERS);

    const rec = {
      service_type: service,
      created_at: randomDate(year, month),
      gender: gender,
      gender_other: null,
      age: age,
      occupation: pick(OCCUPATIONS),
      occupation_other: null,
      wait_time: pick(WAIT_TIMES),
      wait_time_other: null,
      // Service-specific scores
      q6_1: service === 'pt' ? weightedScore(baseScore) : null,
      q6_2: service === 'pt' ? weightedScore(baseScore) : null,
      q6_3: service === 'pt' ? weightedScore(baseScore) : null,
      q7_1: service === 'pt' ? weightedScore(baseScore) : null,
      q7_2: service === 'pt' ? weightedScore(baseScore) : null,
      q7_3: service === 'pt' ? weightedScore(baseScore) : null,
      q7_4: service === 'pt' ? weightedScore(baseScore) : null,
      q7_5: service === 'pt' ? weightedScore(baseScore) : null,
      q7_6: service === 'pt' ? weightedScore(baseScore) : null,
      q8_1: service === 'fitness' ? weightedScore(baseScore) : null,
      q8_2: service === 'fitness' ? weightedScore(baseScore) : null,
      q8_3: service === 'fitness' ? weightedScore(baseScore) : null,
      q9_1: service === 'fitness' ? weightedScore(baseScore) : null,
      q9_2: service === 'fitness' ? weightedScore(baseScore) : null,
      q9_3: service === 'fitness' ? weightedScore(baseScore) : null,
      q9_4: service === 'fitness' ? weightedScore(baseScore) : null,
      q10_1: service === 'hydro' ? weightedScore(baseScore) : null,
      q10_2: service === 'hydro' ? weightedScore(baseScore) : null,
      q10_3: service === 'hydro' ? weightedScore(baseScore) : null,
      q11_1: service === 'hydro' ? weightedScore(baseScore) : null,
      q11_2: service === 'hydro' ? weightedScore(baseScore) : null,
      q11_3: service === 'hydro' ? weightedScore(baseScore) : null,
      q11_4: service === 'hydro' ? weightedScore(baseScore) : null,
      // Facility scores (all services)
      q12_1: weightedScore(baseScore),
      q12_2: weightedScore(baseScore),
      q12_3: weightedScore(baseScore),
      q12_4: weightedScore(baseScore),
      q12_5: weightedScore(baseScore),
      q12_6: weightedScore(baseScore),
      q12_7: weightedScore(baseScore),
      q12_8: weightedScore(baseScore),
      q12_9: weightedScore(baseScore),
      // Text responses
      q13: pick(SUGGESTIONS),
      q14: pick(NEWS_SOURCES),
      // Expectation scores (0-10)
      q15: randInt(5, 10),
      q16: randInt(5, 10),
      q17: pick(IMPRESSIONS),
      // Additional services desired (text)
      q18: pick([null, null, null, 'ต้องการบริการนวดแผนไทย', 'อยากให้มีคลาสโยคะ', 'เพิ่มบริการแพทย์ทางเลือก', null]),
      // NPS, Reason & revisit (0-10)
      q19: randInt(4, 10),
      q20: pick([null, 'บริการดี', 'อุปกรณ์ครบ', 'พนักงานดูแลทั่วถึง', 'เดินทางสะดวก', null, null]),
      q21: randInt(5, 10),
    };

    records.push(rec);
  }
}

// ── Execute ──
console.log(`\n🌱 Seeding ${records.length} survey responses...`);
console.log(`   Period: 2025/01 — 2026/06`);
console.log(`   Services: PT, Fitness, Hydro\n`);

insertMany(records);

// ── Summary ──
const total = db.prepare('SELECT COUNT(*) AS c FROM responses').get().c;
const byYear = db.prepare(`
  SELECT strftime('%Y', created_at) AS yr, COUNT(*) AS c 
  FROM responses GROUP BY yr ORDER BY yr
`).all();
const byQuarter = db.prepare(`
  SELECT strftime('%Y', created_at) AS yr,
         CASE 
           WHEN CAST(strftime('%m', created_at) AS INTEGER) <= 3 THEN 'Q1'
           WHEN CAST(strftime('%m', created_at) AS INTEGER) <= 6 THEN 'Q2'
           WHEN CAST(strftime('%m', created_at) AS INTEGER) <= 9 THEN 'Q3'
           ELSE 'Q4'
         END AS qtr,
         COUNT(*) AS c
  FROM responses GROUP BY yr, qtr ORDER BY yr, qtr
`).all();

console.log(`✅ Done! Total records in DB: ${total}\n`);
console.log('📊 By Year:');
byYear.forEach(r => console.log(`   ${r.yr}: ${r.c} records`));
console.log('\n📊 By Quarter:');
byQuarter.forEach(r => console.log(`   ${r.yr} ${r.qtr}: ${r.c} records`));
console.log('');

db.close();
