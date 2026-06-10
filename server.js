/**
 * ============================================================================
 * AHS Survey Server
 * Faculty of Allied Health Sciences, Naresuan University
 * ============================================================================
 *
 * Express.js backend for the satisfaction survey application.
 * Uses better-sqlite3 for synchronous SQLite database operations.
 *
 * Services covered:
 *   - Fitness & Sauna (fitness)
 *   - Hydrotherapy (hydro)
 *   - Physical Therapy (pt)
 * ============================================================================
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Database Initialization
// ---------------------------------------------------------------------------

// Ensure the data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(path.join(dataDir, 'survey.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create the responses table with all required columns
db.exec(`
  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_type TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),

    -- Section 1: Demographics
    gender TEXT,
    gender_other TEXT,
    age INTEGER,
    occupation TEXT,
    occupation_other TEXT,
    wait_time TEXT,
    wait_time_other TEXT,

    -- Section 2: PT-specific satisfaction questions
    q6_1 INTEGER, q6_2 INTEGER, q6_3 INTEGER,
    q7_1 INTEGER, q7_2 INTEGER, q7_3 INTEGER,
    q7_4 INTEGER, q7_5 INTEGER, q7_6 INTEGER,

    -- Section 3: Fitness-specific satisfaction questions
    q8_1 INTEGER, q8_2 INTEGER, q8_3 INTEGER,
    q9_1 INTEGER, q9_2 INTEGER, q9_3 INTEGER, q9_4 INTEGER,

    -- Section 4: Hydro-specific satisfaction questions
    q10_1 INTEGER, q10_2 INTEGER, q10_3 INTEGER,
    q11_1 INTEGER, q11_2 INTEGER, q11_3 INTEGER, q11_4 INTEGER,

    -- Section 5: Common satisfaction questions (all services)
    q12_1 INTEGER, q12_2 INTEGER, q12_3 INTEGER,
    q12_4 INTEGER, q12_5 INTEGER, q12_6 INTEGER,
    q12_7 INTEGER, q12_8 INTEGER, q12_9 INTEGER,

    -- Section 6: Additional feedback & ratings (all services)
    q13 TEXT,
    q14 TEXT,
    q15 INTEGER,
    q16 INTEGER,
    q17 TEXT,
    q18 TEXT,
    q19 INTEGER,
    q20 TEXT,
    q21 INTEGER
  )
`);

// Migration: renumber q17b→q18, q18→q19, q19→q20
try {
  db.prepare('ALTER TABLE responses ADD COLUMN q20 INTEGER').run();
} catch (_) { /* column already exists */ }
// Check if old q17b column exists and migrate
const _cols = db.prepare("PRAGMA table_info(responses)").all().map(c => c.name);
if (_cols.includes('q17b')) {
  db.prepare('UPDATE responses SET q20 = q19, q19 = q18, q18 = q17b').run();
}

// Migration: add q21 and shift Q20 -> Q21 (revisit intention)
try {
  db.prepare('ALTER TABLE responses ADD COLUMN q21 INTEGER').run();
} catch (_) { /* column already exists */ }

const _cols2 = db.prepare("PRAGMA table_info(responses)").all().map(c => c.name);
if (_cols2.includes('q21')) {
  // Only migrate numeric data from q20 to q21
  db.prepare(`UPDATE responses SET q21 = q20, q20 = NULL WHERE typeof(q20) IN ('integer', 'real')`).run();
}

// ---------------------------------------------------------------------------
// Column Lists (used for dynamic INSERT)
// ---------------------------------------------------------------------------

/** All columns that can be submitted (excludes id and created_at) */
const SUBMITTABLE_COLUMNS = [
  'service_type',
  'gender', 'gender_other', 'age', 'occupation', 'occupation_other',
  'wait_time', 'wait_time_other',
  'q6_1', 'q6_2', 'q6_3',
  'q7_1', 'q7_2', 'q7_3', 'q7_4', 'q7_5', 'q7_6',
  'q8_1', 'q8_2', 'q8_3',
  'q9_1', 'q9_2', 'q9_3', 'q9_4',
  'q10_1', 'q10_2', 'q10_3',
  'q11_1', 'q11_2', 'q11_3', 'q11_4',
  'q12_1', 'q12_2', 'q12_3', 'q12_4', 'q12_5', 'q12_6',
  'q12_7', 'q12_8', 'q12_9',
  'q13', 'q14', 'q15', 'q16', 'q17', 'q18', 'q19', 'q20', 'q21',
];

/** Service-specific scored question keys */
const SERVICE_QUESTIONS = {
  pt: ['q6_1', 'q6_2', 'q6_3', 'q7_1', 'q7_2', 'q7_3', 'q7_4', 'q7_5', 'q7_6'],
  fitness: ['q8_1', 'q8_2', 'q8_3', 'q9_1', 'q9_2', 'q9_3', 'q9_4'],
  hydro: ['q10_1', 'q10_2', 'q10_3', 'q11_1', 'q11_2', 'q11_3', 'q11_4'],
};

/** Common scored questions (Section 5) */
const COMMON_QUESTIONS = [
  'q12_1', 'q12_2', 'q12_3', 'q12_4', 'q12_5',
  'q12_6', 'q12_7', 'q12_8', 'q12_9',
];

/**
 * Total number of scored questions per service (service-specific + common).
 * Used for overallSatisfactionMean calculation.
 */
const SERVICE_TOTAL_QUESTIONS = {
  fitness: SERVICE_QUESTIONS.fitness.length + COMMON_QUESTIONS.length, // 7 + 9 = 16
  hydro: SERVICE_QUESTIONS.hydro.length + COMMON_QUESTIONS.length,     // 7 + 9 = 16
  pt: SERVICE_QUESTIONS.pt.length + COMMON_QUESTIONS.length,           // 9 + 9 = 18
};

/** Age range definitions for the ageRange filter */
const AGE_RANGES = {
  '<18':   { min: 0, max: 17 },
  '18-24': { min: 18, max: 24 },
  '25-34': { min: 25, max: 34 },
  '35-44': { min: 35, max: 44 },
  '45-54': { min: 45, max: 54 },
  '55-64': { min: 55, max: 64 },
  '65+':   { min: 65, max: 999 },
};

// Prepare the INSERT statement once for efficiency
const insertColumns = SUBMITTABLE_COLUMNS.join(', ');
const insertPlaceholders = SUBMITTABLE_COLUMNS.map(() => '?').join(', ');
const insertStmt = db.prepare(
  `INSERT INTO responses (${insertColumns}) VALUES (${insertPlaceholders})`
);

// ---------------------------------------------------------------------------
// Utility: Round to 2 decimal places (safe)
// ---------------------------------------------------------------------------
function round2(value) {
  if (value === null || value === undefined || isNaN(value)) return 0;
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Utility: Build WHERE clause from multiple filter query params
// ---------------------------------------------------------------------------
/**
 * Builds a dynamic WHERE clause and params array from query parameters.
 * Supports: service, ageRange, occupation
 * Filters are stacked with AND.
 *
 * @param {object} query - req.query object
 * @returns {{ whereClause: string, params: any[] }}
 */
function buildWhereClause(query) {
  const validServices = ['fitness', 'hydro', 'pt'];
  const conditions = [];
  const params = [];

  // Filter: service
  if (query.service && validServices.includes(query.service)) {
    conditions.push('service_type = ?');
    params.push(query.service);
  }

  // Filter: ageRange (e.g. '18-24', '65+')
  if (query.ageRange && AGE_RANGES[query.ageRange]) {
    const { min, max } = AGE_RANGES[query.ageRange];
    conditions.push('age >= ? AND age <= ?');
    params.push(min, max);
  }

  // Filter: occupation (exact match)
  if (query.occupation) {
    conditions.push('occupation = ?');
    params.push(query.occupation);
  }

  // Filter: dateFrom (created_at >= YYYY-MM-DD)
  if (query.dateFrom) {
    conditions.push('created_at >= ?');
    params.push(query.dateFrom);
  }

  // Filter: dateTo (created_at < dateTo + 1 day, inclusive of the end date)
  if (query.dateTo) {
    conditions.push("created_at < date(?, '+1 day')");
    params.push(query.dateTo);
  }

  // Filter: quarter — Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
  // If year is also provided it is combined; otherwise defaults to current year.
  if (query.quarter) {
    const quarterMonths = {
      Q1: [1, 2, 3],
      Q2: [4, 5, 6],
      Q3: [7, 8, 9],
      Q4: [10, 11, 12],
    };
    const months = quarterMonths[query.quarter.toUpperCase()];
    if (months) {
      const placeholders = months.map(() => '?').join(', ');
      conditions.push(`CAST(strftime('%m', created_at) AS INTEGER) IN (${placeholders})`);
      params.push(...months);

      // Combine with year (provided or current)
      const year = query.year || new Date().getFullYear().toString();
      conditions.push("strftime('%Y', created_at) = ?");
      params.push(year);
    }
  } else if (query.year) {
    // Filter: year only (no quarter)
    conditions.push("strftime('%Y', created_at) = ?");
    params.push(query.year);
  }

  const whereClause = conditions.length > 0
    ? 'WHERE ' + conditions.join(' AND ')
    : '';

  return { whereClause, params };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Root route — serves the static index.html
 */
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// POST /api/submit — Submit a survey response
// ---------------------------------------------------------------------------
app.post('/api/submit', (req, res) => {
  try {
    const body = req.body;

    // Validate that service_type is provided
    if (!body.service_type) {
      return res.status(400).json({
        success: false,
        message: 'service_type is required',
      });
    }

    // Validate service_type value
    const validServices = ['fitness', 'hydro', 'pt'];
    if (!validServices.includes(body.service_type)) {
      return res.status(400).json({
        success: false,
        message: 'service_type must be one of: fitness, hydro, pt',
      });
    }

    // Build the values array, using null for any missing fields
    const values = SUBMITTABLE_COLUMNS.map((col) =>
      body[col] !== undefined ? body[col] : null
    );

    const result = insertStmt.run(...values);

    return res.json({
      success: true,
      id: result.lastInsertRowid,
    });
  } catch (err) {
    console.error('Error inserting response:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/stats — Comprehensive statistics for the admin dashboard
// ---------------------------------------------------------------------------
app.get('/api/stats', (req, res) => {
  try {
    // Build combined WHERE clause from all query filters
    const { whereClause, params } = buildWhereClause(req.query);
    const service = req.query.service;

    // --- Total count ---
    const totalRow = db.prepare(
      `SELECT COUNT(*) AS total FROM responses ${whereClause}`
    ).get(...params);
    const total = totalRow.total;

    // --- Service distribution ---
    const serviceDistribution = db.prepare(
      `SELECT service_type, COUNT(*) AS count
       FROM responses ${whereClause}
       GROUP BY service_type
       ORDER BY count DESC`
    ).all(...params);

    // --- Age distribution ---
    const ageDistribution = buildAgeDistribution(whereClause, params);

    // --- Occupation distribution ---
    const occupationDistribution = db.prepare(
      `SELECT occupation, COUNT(*) AS count
       FROM responses ${whereClause}
       GROUP BY occupation
       ORDER BY count DESC`
    ).all(...params);

    // --- Wait time distribution ---
    const waitTimeDistribution = db.prepare(
      `SELECT wait_time, COUNT(*) AS count
       FROM responses ${whereClause}
       GROUP BY wait_time
       ORDER BY count DESC`
    ).all(...params);

    // --- Wait time by service (for clustered column chart) ---
    const waitTimeByService = buildWaitTimeByService(whereClause, params);

    // --- News source distribution (q14) ---
    const newsSourceDistribution = buildNewsSourceDistribution(whereClause, params);

    // --- Satisfaction averages ---
    const satisfactionAvg = buildSatisfactionAvg(service, whereClause, params);

    // --- Score distribution (for 100% stacked bar chart) ---
    const scoreDistribution = buildScoreDistribution(service, whereClause, params);

    // --- Expectation scores ---
    const expectationAvg = buildExpectationAvg(whereClause, params);

    // --- Recent text feedback (last 20) ---
    const recentFeedback = db.prepare(
      `SELECT id, service_type, q13, q17, q18, created_at
       FROM responses ${whereClause}
       ORDER BY id DESC
       LIMIT 20`
    ).all(...params);

    // =====================================================================
    // NEW KPI FIELDS
    // =====================================================================

    // --- 1. Occupation Percentage ---
    const occupationPercentage = buildOccupationPercentage(total, whereClause, params);

    // --- 2. News Source Percentage ---
    const newsSourcePercentage = buildNewsSourcePercentage(total, whereClause, params);

    // --- 3. Service Percentage ---
    const servicePercentage = buildServicePercentage(total, whereClause, params);

    // --- 4. Wait Time Efficiency ---
    const waitTimeEfficiency = buildWaitTimeEfficiency(whereClause, params);

    // --- 5. Overall Satisfaction Mean ---
    const overallSatisfactionMean = buildOverallSatisfactionMean(whereClause, params);

    // --- 6. NPS (Net Promoter Score) ---
    const nps = buildNPS(whereClause, params);

    // --- 7. Expectation Comparison ---
    const expectationComparison = buildExpectationComparison(whereClause, params);

    // --- 8. Recommendation Average ---
    const recommendationAvg = buildRecommendationAvg(whereClause, params);

    return res.json({
      // Existing fields
      total,
      serviceDistribution,
      ageDistribution,
      occupationDistribution,
      waitTimeDistribution,
      waitTimeByService,
      newsSourceDistribution,
      satisfactionAvg,
      scoreDistribution,
      expectationAvg,
      recentFeedback,
      // New KPI fields
      occupationPercentage,
      newsSourcePercentage,
      servicePercentage,
      waitTimeEfficiency,
      overallSatisfactionMean,
      nps,
      expectationComparison,
      recommendationAvg,
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// POST /api/admin/login — Admin authentication (username + password)
// ---------------------------------------------------------------------------
const ADMIN_ACCOUNTS = [
  { username: 'admin', password: 'admin2024', displayName: 'ผู้ดูแลระบบ' },
  { username: 'aaaa',  password: 'aaaa1234',  displayName: 'aaaa' },
  { username: 'bbbb',  password: 'bbbb1234',  displayName: 'bbbb' },
];

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน',
    });
  }

  const account = ADMIN_ACCOUNTS.find(
    (acc) => acc.username === username && acc.password === password
  );

  if (account) {
    return res.json({
      success: true,
      displayName: account.displayName,
    });
  }

  return res.status(401).json({
    success: false,
    message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  });
});

// ---------------------------------------------------------------------------
// Existing Helper Functions for /api/stats
// ---------------------------------------------------------------------------

/**
 * Build age distribution grouped into standard ranges.
 */
function buildAgeDistribution(whereClause, params) {
  const ranges = [
    { label: '<18', min: 0, max: 17 },
    { label: '18-24', min: 18, max: 24 },
    { label: '25-34', min: 25, max: 34 },
    { label: '35-44', min: 35, max: 44 },
    { label: '45-54', min: 45, max: 54 },
    { label: '55-64', min: 55, max: 64 },
    { label: '65+', min: 65, max: 999 },
  ];

  return ranges.map(({ label, min, max }) => {
    const ageWhere = whereClause
      ? `${whereClause} AND age >= ? AND age <= ?`
      : 'WHERE age >= ? AND age <= ?';
    const ageParams = [...params, min, max];

    const row = db.prepare(
      `SELECT COUNT(*) AS count FROM responses ${ageWhere}`
    ).get(...ageParams);

    return { range: label, count: row.count };
  });
}

/**
 * Build wait time broken down by service type (for clustered column charts).
 */
function buildWaitTimeByService(whereClause, params) {
  // Get all distinct wait_time values
  const waitTimes = db.prepare(
    `SELECT DISTINCT wait_time FROM responses
     ${whereClause}
     ORDER BY wait_time`
  ).all(...params);

  return waitTimes.map(({ wait_time }) => {
    const result = { wait_time, fitness: 0, hydro: 0, pt: 0 };

    const baseWhere = whereClause
      ? `${whereClause} AND wait_time = ?`
      : 'WHERE wait_time = ?';

    // Count per service for this wait_time
    const rows = db.prepare(
      `SELECT service_type, COUNT(*) AS count
       FROM responses
       ${baseWhere}
       GROUP BY service_type`
    ).all(...params, wait_time);

    rows.forEach((row) => {
      if (result.hasOwnProperty(row.service_type)) {
        result[row.service_type] = row.count;
      }
    });

    return result;
  });
}

/**
 * Build news source distribution from q14 (free-text or multi-select field).
 * Handles comma-separated values in q14 by splitting and counting each source.
 */
function buildNewsSourceDistribution(whereClause, params) {
  const rows = db.prepare(
    `SELECT q14 FROM responses ${whereClause}`
  ).all(...params);

  const sourceCounts = {};

  rows.forEach(({ q14 }) => {
    if (!q14) return;

    // Support comma-separated values for multi-select
    const sources = q14.split(',').map((s) => s.trim()).filter(Boolean);
    sources.forEach((source) => {
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });
  });

  // Convert to sorted array
  return Object.entries(sourceCounts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Build average satisfaction scores for all relevant questions.
 * Dynamically includes the correct service-specific section based on filter.
 */
function buildSatisfactionAvg(service, whereClause, params) {
  const result = {};
  let allScores = [];

  // Determine which service-specific questions to include
  let serviceKeys = [];
  if (service && SERVICE_QUESTIONS[service]) {
    serviceKeys = SERVICE_QUESTIONS[service];
  } else {
    // No filter: include all service-specific questions
    serviceKeys = [
      ...SERVICE_QUESTIONS.pt,
      ...SERVICE_QUESTIONS.fitness,
      ...SERVICE_QUESTIONS.hydro,
    ];
  }

  // Combine service-specific + common questions
  const allQuestionKeys = [...serviceKeys, ...COMMON_QUESTIONS];

  allQuestionKeys.forEach((qKey) => {
    // Build the correct query with proper WHERE/AND logic
    const query = whereClause
      ? `SELECT AVG(CAST(${qKey} AS REAL)) AS avg_score FROM responses ${whereClause} AND ${qKey} IS NOT NULL`
      : `SELECT AVG(CAST(${qKey} AS REAL)) AS avg_score FROM responses WHERE ${qKey} IS NOT NULL`;

    const avgRow = db.prepare(query).get(...params);
    const avg = avgRow.avg_score !== null ? Math.round(avgRow.avg_score * 100) / 100 : null;
    result[qKey] = avg;

    if (avg !== null) {
      allScores.push(avg);
    }
  });

  // Calculate overall average across all scored questions
  result.overall = allScores.length > 0
    ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100) / 100
    : null;

  return result;
}

/**
 * Build score distribution for each question (counts of 0–5 ratings).
 * Used for 100% stacked bar charts.
 */
function buildScoreDistribution(service, whereClause, params) {
  const result = {};

  // Determine which questions to include
  let questionKeys = [...COMMON_QUESTIONS];
  if (service && SERVICE_QUESTIONS[service]) {
    questionKeys = [...SERVICE_QUESTIONS[service], ...questionKeys];
  } else {
    // No filter: include all service questions
    questionKeys = [
      ...SERVICE_QUESTIONS.pt,
      ...SERVICE_QUESTIONS.fitness,
      ...SERVICE_QUESTIONS.hydro,
      ...questionKeys,
    ];
  }

  questionKeys.forEach((qKey) => {
    const distribution = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    const query = whereClause
      ? `SELECT ${qKey} AS score, COUNT(*) AS count FROM responses ${whereClause} AND ${qKey} IS NOT NULL GROUP BY ${qKey}`
      : `SELECT ${qKey} AS score, COUNT(*) AS count FROM responses WHERE ${qKey} IS NOT NULL GROUP BY ${qKey}`;

    const rows = db.prepare(query).all(...params);

    rows.forEach(({ score, count }) => {
      if (score >= 0 && score <= 5) {
        distribution[score] = count;
      }
    });

    result[qKey] = distribution;
  });

  return result;
}

/**
 * Build expectation averages (before/after visit, recommend, reuse).
 */
function buildExpectationAvg(whereClause, params) {
  const fields = {
    before: 'q15',
    after: 'q16',
    recommend: 'q19',
    reuse: 'q21',
  };

  const result = {};

  Object.entries(fields).forEach(([key, col]) => {
    const query = whereClause
      ? `SELECT AVG(CAST(${col} AS REAL)) AS avg_val FROM responses ${whereClause} AND ${col} IS NOT NULL`
      : `SELECT AVG(CAST(${col} AS REAL)) AS avg_val FROM responses WHERE ${col} IS NOT NULL`;

    const row = db.prepare(query).get(...params);
    result[key] = row.avg_val !== null
      ? Math.round(row.avg_val * 100) / 100
      : null;
  });

  return result;
}

// ---------------------------------------------------------------------------
// NEW KPI Helper Functions
// ---------------------------------------------------------------------------

/**
 * 1. Occupation Percentage
 * For each occupation: (Count / Total) * 100
 */
function buildOccupationPercentage(total, whereClause, params) {
  const rows = db.prepare(
    `SELECT occupation, COUNT(*) AS count
     FROM responses ${whereClause}
     GROUP BY occupation
     ORDER BY count DESC`
  ).all(...params);

  return rows.map(({ occupation, count }) => ({
    occupation: occupation || 'ไม่ระบุ',
    count,
    percentage: total > 0 ? round2((count / total) * 100) : 0,
  }));
}

/**
 * 2. News Source Percentage
 * For each news source in q14: (Count / Total) * 100
 * Handles comma-separated multi-select values.
 */
function buildNewsSourcePercentage(total, whereClause, params) {
  const rows = db.prepare(
    `SELECT q14 FROM responses ${whereClause}`
  ).all(...params);

  const sourceCounts = {};

  rows.forEach(({ q14 }) => {
    if (!q14) return;
    const sources = q14.split(',').map((s) => s.trim()).filter(Boolean);
    sources.forEach((source) => {
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });
  });

  return Object.entries(sourceCounts)
    .map(([source, count]) => ({
      source,
      count,
      percentage: total > 0 ? round2((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 3. Service Percentage
 * For each service_type: (Users in service / Total) * 100
 */
function buildServicePercentage(total, whereClause, params) {
  const rows = db.prepare(
    `SELECT service_type, COUNT(*) AS count
     FROM responses ${whereClause}
     GROUP BY service_type
     ORDER BY count DESC`
  ).all(...params);

  return rows.map(({ service_type, count }) => ({
    service_type,
    count,
    percentage: total > 0 ? round2((count / total) * 100) : 0,
  }));
}

/**
 * 4. Wait Time Efficiency
 * Per department + overall: % of users who waited < 15 mins.
 * Matches wait_time values containing 'น้อยกว่า 15' or '<15'.
 */
function buildWaitTimeEfficiency(whereClause, params) {
  const services = ['fitness', 'hydro', 'pt'];
  const result = {};

  let overallTotal = 0;
  let overallUnder15 = 0;

  services.forEach((svc) => {
    // Total users in this service (within current filters)
    const svcWhere = whereClause
      ? `${whereClause} AND service_type = ?`
      : 'WHERE service_type = ?';
    const svcParams = [...params, svc];

    const totalRow = db.prepare(
      `SELECT COUNT(*) AS total FROM responses ${svcWhere}`
    ).get(...svcParams);
    const svcTotal = totalRow.total;

    // Users who waited < 15 mins in this service
    const under15Where = `${svcWhere} AND (wait_time LIKE '%น้อยกว่า 15%' OR wait_time LIKE '%<15%')`;

    const under15Row = db.prepare(
      `SELECT COUNT(*) AS count FROM responses ${under15Where}`
    ).get(...svcParams);
    const svcUnder15 = under15Row.count;

    result[svc] = {
      total: svcTotal,
      under15: svcUnder15,
      percentage: svcTotal > 0 ? round2((svcUnder15 / svcTotal) * 100) : 0,
    };

    overallTotal += svcTotal;
    overallUnder15 += svcUnder15;
  });

  result.overall = {
    total: overallTotal,
    under15: overallUnder15,
    percentage: overallTotal > 0 ? round2((overallUnder15 / overallTotal) * 100) : 0,
  };

  return result;
}

/**
 * 5. Overall Satisfaction Mean
 * Per service + overall:
 *   Mean = Sum of all scored question values / (numQuestions × numRespondents)
 *   Percentage = (Mean / 5) × 100
 */
function buildOverallSatisfactionMean(whereClause, params) {
  const services = ['fitness', 'hydro', 'pt'];
  const result = {};

  let grandTotalSum = 0;
  let grandTotalPossible = 0;

  services.forEach((svc) => {
    const svcQuestions = [...SERVICE_QUESTIONS[svc], ...COMMON_QUESTIONS];
    const numQuestions = SERVICE_TOTAL_QUESTIONS[svc];

    // Get all respondents for this service (within current filters)
    const svcWhere = whereClause
      ? `${whereClause} AND service_type = ?`
      : 'WHERE service_type = ?';
    const svcParams = [...params, svc];

    // Build a SUM expression for all scored questions
    const sumExpr = svcQuestions
      .map((q) => `COALESCE(${q}, 0)`)
      .join(' + ');

    const rows = db.prepare(
      `SELECT (${sumExpr}) AS row_sum FROM responses ${svcWhere}`
    ).all(...svcParams);

    const respondents = rows.length;
    const totalSum = rows.reduce((acc, row) => acc + (row.row_sum || 0), 0);

    const denominator = numQuestions * respondents;
    const mean = denominator > 0 ? round2(totalSum / denominator) : 0;
    const percentage = round2((mean / 5) * 100);

    result[svc] = {
      mean,
      percentage,
      respondents,
    };

    grandTotalSum += totalSum;
    grandTotalPossible += denominator;
  });

  // Overall across all services
  const overallMean = grandTotalPossible > 0
    ? round2(grandTotalSum / grandTotalPossible)
    : 0;

  result.overall = {
    mean: overallMean,
    percentage: round2((overallMean / 5) * 100),
  };

  return result;
}

/**
 * 6. NPS — Net Promoter Score from Q19
 * Promoters: 9-10, Passives: 7-8, Detractors: 0-6
 * NPS = %Promoters - %Detractors
 */
function buildNPS(whereClause, params) {
  const q19Where = whereClause
    ? `${whereClause} AND q19 IS NOT NULL`
    : 'WHERE q19 IS NOT NULL';

  const rows = db.prepare(
    `SELECT q19 FROM responses ${q19Where}`
  ).all(...params);

  const totalResponses = rows.length;
  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  rows.forEach(({ q19 }) => {
    const score = Number(q19);
    if (score >= 9) {
      promoters++;
    } else if (score >= 7) {
      passives++;
    } else {
      detractors++;
    }
  });

  const promoterPct = totalResponses > 0 ? round2((promoters / totalResponses) * 100) : 0;
  const passivePct = totalResponses > 0 ? round2((passives / totalResponses) * 100) : 0;
  const detractorPct = totalResponses > 0 ? round2((detractors / totalResponses) * 100) : 0;

  return {
    promoters: { count: promoters, percentage: promoterPct },
    passives: { count: passives, percentage: passivePct },
    detractors: { count: detractors, percentage: detractorPct },
    nps: round2(promoterPct - detractorPct),
    totalResponses,
  };
}

/**
 * 7. Expectation Comparison
 * Compares Q15 (before) vs Q16 (after), overall and per service.
 */
function buildExpectationComparison(whereClause, params) {
  // --- Overall ---
  const beforeQuery = whereClause
    ? `SELECT AVG(CAST(q15 AS REAL)) AS avg, COUNT(q15) AS count FROM responses ${whereClause} AND q15 IS NOT NULL`
    : `SELECT AVG(CAST(q15 AS REAL)) AS avg, COUNT(q15) AS count FROM responses WHERE q15 IS NOT NULL`;

  const afterQuery = whereClause
    ? `SELECT AVG(CAST(q16 AS REAL)) AS avg, COUNT(q16) AS count FROM responses ${whereClause} AND q16 IS NOT NULL`
    : `SELECT AVG(CAST(q16 AS REAL)) AS avg, COUNT(q16) AS count FROM responses WHERE q16 IS NOT NULL`;

  const beforeRow = db.prepare(beforeQuery).get(...params);
  const afterRow = db.prepare(afterQuery).get(...params);

  const beforeAvg = beforeRow.avg !== null ? round2(beforeRow.avg) : 0;
  const afterAvg = afterRow.avg !== null ? round2(afterRow.avg) : 0;

  const result = {
    before: { avg: beforeAvg, count: beforeRow.count },
    after: { avg: afterAvg, count: afterRow.count },
    difference: round2(afterAvg - beforeAvg),
  };

  // --- Per service breakdown ---
  const services = ['fitness', 'hydro', 'pt'];
  const byService = {};

  services.forEach((svc) => {
    const svcWhere = whereClause
      ? `${whereClause} AND service_type = ?`
      : 'WHERE service_type = ?';
    const svcParams = [...params, svc];

    const svcBeforeQuery = `SELECT AVG(CAST(q15 AS REAL)) AS avg, COUNT(q15) AS count FROM responses ${svcWhere} AND q15 IS NOT NULL`;
    const svcAfterQuery = `SELECT AVG(CAST(q16 AS REAL)) AS avg, COUNT(q16) AS count FROM responses ${svcWhere} AND q16 IS NOT NULL`;

    const svcBefore = db.prepare(svcBeforeQuery).get(...svcParams);
    const svcAfter = db.prepare(svcAfterQuery).get(...svcParams);

    const svcBeforeAvg = svcBefore.avg !== null ? round2(svcBefore.avg) : 0;
    const svcAfterAvg = svcAfter.avg !== null ? round2(svcAfter.avg) : 0;

    byService[svc] = {
      before: { avg: svcBeforeAvg, count: svcBefore.count },
      after: { avg: svcAfterAvg, count: svcAfter.count },
      difference: round2(svcAfterAvg - svcBeforeAvg),
    };
  });

  result.byService = byService;

  return result;
}

/**
 * 8. Recommendation Average
 * Average of Q19 (recommend) and Q21 (reuse).
 */
function buildRecommendationAvg(whereClause, params) {
  const q19Query = whereClause
    ? `SELECT AVG(CAST(q19 AS REAL)) AS avg, COUNT(q19) AS count FROM responses ${whereClause} AND q19 IS NOT NULL`
    : `SELECT AVG(CAST(q19 AS REAL)) AS avg, COUNT(q19) AS count FROM responses WHERE q19 IS NOT NULL`;

  const q21Query = whereClause
    ? `SELECT AVG(CAST(q21 AS REAL)) AS avg, COUNT(q21) AS count FROM responses ${whereClause} AND q21 IS NOT NULL`
    : `SELECT AVG(CAST(q21 AS REAL)) AS avg, COUNT(q21) AS count FROM responses WHERE q21 IS NOT NULL`;

  const q19Row = db.prepare(q19Query).get(...params);
  const q21Row = db.prepare(q21Query).get(...params);

  return {
    recommend: {
      avg: q19Row.avg !== null ? round2(q19Row.avg) : 0,
      count: q19Row.count,
    },
    reuse: {
      avg: q21Row.avg !== null ? round2(q21Row.avg) : 0,
      count: q21Row.count,
    },
  };
}

// GET /api/export/excel — Export filtered survey data as an Excel (.xlsx) file
// ---------------------------------------------------------------------------
app.get('/api/export/excel', async (req, res) => {
  try {
    const { whereClause, params } = buildWhereClause(req.query);

    const rows = db.prepare(
      `SELECT * FROM responses ${whereClause} ORDER BY created_at DESC`
    ).all(...params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AHS Survey System — คณะสหเวชศาสตร์ ม.นเรศวร';
    workbook.created = new Date();

    // ── Color Palette ──
    const C = {
      teal:      'FF0D9488',
      tealLight: 'FFE6FFFA',
      blue:      'FF2563EB',
      blueLight: 'FFDBEAFE',
      purple:    'FF7C3AED',
      purpleLight:'FFEDE9FE',
      amber:     'FFF59E0B',
      amberLight:'FFFFFBEB',
      green:     'FF16A34A',
      greenLight:'FFDCFCE7',
      gray:      'FF64748B',
      grayLight: 'FFF1F5F9',
      grayAlt:   'FFF8FAFC',
      white:     'FFFFFFFF',
      dark:      'FF1E293B',
      red:       'FFEF4444',
    };

    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };

    const headerFont = { bold: true, color: { argb: C.white }, size: 11, name: 'Tahoma' };
    const defaultFont = { size: 10, name: 'Tahoma' };

    // Helper: style a header row
    function styleHeader(row, color) {
      row.height = 28;
      row.eachCell((cell) => {
        cell.font = headerFont;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = thinBorder;
      });
    }

    // Helper: alternating row colors
    function styleDataRows(sheet, startRow, lightColor) {
      for (let i = startRow; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = defaultFont;
          cell.border = thinBorder;
          cell.alignment = { vertical: 'middle' };
          if (i % 2 === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightColor } };
          }
        });
      }
    }

    // ── Service type Thai mapping ──
    const svcNameTh = { fitness: 'ฟิตเนสและซาวน่า', hydro: 'ธาราบำบัด', pt: 'กายภาพบำบัด' };

    // ══════════════════════════════════════════════════════════════════════
    // SHEET 1: สรุปภาพรวม (Summary)
    // ══════════════════════════════════════════════════════════════════════
    const s1 = workbook.addWorksheet('📊 สรุปภาพรวม', {
      properties: { tabColor: { argb: C.teal } },
    });

    // Title
    s1.mergeCells('A1:F1');
    const titleCell = s1.getCell('A1');
    titleCell.value = '📊 สรุปผลแบบสำรวจความพึงพอใจ — คณะสหเวชศาสตร์ มหาวิทยาลัยนเรศวร';
    titleCell.font = { bold: true, size: 14, color: { argb: C.dark }, name: 'Tahoma' };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    s1.getRow(1).height = 36;

    s1.mergeCells('A2:F2');
    const dateCell = s1.getCell('A2');
    dateCell.value = `วันที่ Export: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}    |    จำนวนข้อมูล: ${rows.length} รายการ`;
    dateCell.font = { size: 10, color: { argb: C.gray }, name: 'Tahoma' };
    dateCell.alignment = { horizontal: 'center' };

    // Summary stats
    let r = 4;
    function addSectionTitle(title, color) {
      s1.mergeCells(`A${r}:F${r}`);
      const c = s1.getCell(`A${r}`);
      c.value = title;
      c.font = { bold: true, size: 12, color: { argb: C.white }, name: 'Tahoma' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      c.alignment = { horizontal: 'left', vertical: 'middle' };
      s1.getRow(r).height = 28;
      r++;
    }

    function addStatRow(label, value, note) {
      s1.getCell(`A${r}`).value = label;
      s1.getCell(`A${r}`).font = { ...defaultFont, bold: true };
      s1.getCell(`B${r}`).value = value;
      s1.getCell(`B${r}`).font = { ...defaultFont, bold: true, size: 12, color: { argb: C.teal } };
      s1.getCell(`B${r}`).alignment = { horizontal: 'center' };
      if (note) {
        s1.mergeCells(`C${r}:F${r}`);
        s1.getCell(`C${r}`).value = note;
        s1.getCell(`C${r}`).font = { ...defaultFont, color: { argb: C.gray }, italic: true };
      }
      r++;
    }

    // Calculate stats from rows
    const totalCount = rows.length;
    const ptRows = rows.filter(x => x.service_type === 'pt');
    const fitRows = rows.filter(x => x.service_type === 'fitness');
    const hydRows = rows.filter(x => x.service_type === 'hydro');

    // Overall satisfaction mean
    const allScoreKeys = [
      'q6_1','q6_2','q6_3','q7_1','q7_2','q7_3','q7_4','q7_5','q7_6',
      'q8_1','q8_2','q8_3','q9_1','q9_2','q9_3','q9_4',
      'q10_1','q10_2','q10_3','q11_1','q11_2','q11_3','q11_4',
      'q12_1','q12_2','q12_3','q12_4','q12_5','q12_6','q12_7','q12_8','q12_9',
    ];
    let scoreSum = 0, scoreCount = 0;
    rows.forEach(row => {
      allScoreKeys.forEach(k => {
        if (row[k] !== null && row[k] !== undefined) { scoreSum += row[k]; scoreCount++; }
      });
    });
    const overallMean = scoreCount > 0 ? (scoreSum / scoreCount) : 0;

    // NPS from q19
    let promoters = 0, passives = 0, detractors = 0;
    rows.forEach(row => {
      if (row.q19 !== null && row.q19 !== undefined) {
        if (row.q19 >= 9) promoters++;
        else if (row.q19 >= 7) passives++;
        else detractors++;
      }
    });
    const npsTotal = promoters + passives + detractors;
    const npsScore = npsTotal > 0 ? Math.round(((promoters - detractors) / npsTotal) * 100) : 0;

    // Wait time under 15 min
    const waitUnder15 = rows.filter(x => x.wait_time === 'น้อยกว่า 15 นาที' || x.wait_time === '<15').length;
    const waitPct = totalCount > 0 ? ((waitUnder15 / totalCount) * 100).toFixed(1) : 0;

    addSectionTitle('📋 ข้อมูลทั่วไป', C.teal);
    addStatRow('จำนวนผู้ตอบแบบสอบถามทั้งหมด', totalCount + ' คน', '');
    addStatRow('กายภาพบำบัด (PT)', ptRows.length + ' คน', `${totalCount > 0 ? ((ptRows.length / totalCount) * 100).toFixed(1) : 0}%`);
    addStatRow('ฟิตเนสและซาวน่า', fitRows.length + ' คน', `${totalCount > 0 ? ((fitRows.length / totalCount) * 100).toFixed(1) : 0}%`);
    addStatRow('ธาราบำบัด', hydRows.length + ' คน', `${totalCount > 0 ? ((hydRows.length / totalCount) * 100).toFixed(1) : 0}%`);
    r++;

    addSectionTitle('⭐ ผลลัพธ์ KPI หลัก', C.blue);
    addStatRow('คะแนนความพึงพอใจภาพรวม', overallMean.toFixed(2) + ' / 5', `คิดเป็น ${(overallMean / 5 * 100).toFixed(1)}%`);
    addStatRow('NPS (Net Promoter Score)', (npsScore > 0 ? '+' : '') + npsScore, `Promoters: ${promoters} | Passives: ${passives} | Detractors: ${detractors}`);
    addStatRow('เวลารอ < 15 นาที', waitPct + '%', `${waitUnder15} จาก ${totalCount} คน`);
    r++;

    // Age distribution
    addSectionTitle('👥 การกระจายช่วงอายุ', C.purple);
    const ageGroups = { '<18': 0, '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55-64': 0, '65+': 0 };
    rows.forEach(row => {
      const a = row.age;
      if (a < 18) ageGroups['<18']++;
      else if (a <= 24) ageGroups['18-24']++;
      else if (a <= 34) ageGroups['25-34']++;
      else if (a <= 44) ageGroups['35-44']++;
      else if (a <= 54) ageGroups['45-54']++;
      else if (a <= 64) ageGroups['55-64']++;
      else if (a !== null) ageGroups['65+']++;
    });
    Object.entries(ageGroups).forEach(([label, count]) => {
      addStatRow(`อายุ ${label} ปี`, count + ' คน', `${totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : 0}%`);
    });
    r++;

    // Top 3 News Sources (Q14 — multi-select)
    addSectionTitle('📰 Top 3 ช่องทางรับรู้ข่าวสาร (Q14)', C.amber);
    const newsSrcCounts = {};
    rows.forEach(row => {
      if (!row.q14) return;
      row.q14.split(',').map(s => s.trim()).filter(Boolean).forEach(src => {
        newsSrcCounts[src] = (newsSrcCounts[src] || 0) + 1;
      });
    });
    const topSources = Object.entries(newsSrcCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    topSources.forEach(([src, count], i) => {
      const pct = totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : 0;
      addStatRow(`${medals[i]} อันดับ ${i + 1}: ${src}`, count + ' คน', `${pct}% ของผู้ตอบทั้งหมด`);
    });

    s1.columns = [
      { width: 32 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
    ];

    // ══════════════════════════════════════════════════════════════════════
    // SHEETS: KPI แยกบริการ (PT, Fitness, Hydro)
    // ══════════════════════════════════════════════════════════════════════
    const serviceConfigs = [
      { key: 'pt',      name: '🏥 KPI กายภาพบำบัด',    color: C.green,  scoreKeys: ['q6_1','q6_2','q6_3','q7_1','q7_2','q7_3','q7_4','q7_5','q7_6'] },
      { key: 'fitness', name: '💪 KPI ฟิตเนส&ซาวน่า', color: C.amber,  scoreKeys: ['q8_1','q8_2','q8_3','q9_1','q9_2','q9_3','q9_4'] },
      { key: 'hydro',   name: '🌊 KPI ธาราบำบัด',      color: C.purple, scoreKeys: ['q10_1','q10_2','q10_3','q11_1','q11_2','q11_3','q11_4'] },
    ];

    const questionLabels = {
      q6_1: 'นัดหมายสะดวก', q6_2: 'นัดหมายรวดเร็ว', q6_3: 'นัดหมายยืดหยุ่น',
      q7_1: 'สุภาพ/จิตบริการ', q7_2: 'เปิดโอกาสซักถาม', q7_3: 'อธิบายชัดเจน',
      q7_4: 'ความรู้/ทักษะ', q7_5: 'ประสิทธิภาพรักษา', q7_6: 'พึงพอใจ PT รวม',
      q8_1: 'นัดหมายสะดวก', q8_2: 'นัดหมายรวดเร็ว', q8_3: 'นัดหมายยืดหยุ่น',
      q9_1: 'สุภาพ/จิตบริการ', q9_2: 'เปิดโอกาสซักถาม', q9_3: 'อธิบายชัดเจน', q9_4: 'พึงพอใจ Fit รวม',
      q10_1: 'นัดหมายสะดวก', q10_2: 'นัดหมายรวดเร็ว', q10_3: 'นัดหมายยืดหยุ่น',
      q11_1: 'สุภาพ/จิตบริการ', q11_2: 'เปิดโอกาสซักถาม', q11_3: 'อธิบายชัดเจน', q11_4: 'พึงพอใจ Hydro รวม',
      q12_1: 'สะอาด/ระเบียบ', q12_2: 'สะดวกเข้าถึง', q12_3: 'พร้อมอุปกรณ์',
      q12_4: 'สวยงาม', q12_5: 'บรรยากาศผ่อนคลาย', q12_6: 'เงียบสงบ/ส่วนตัว',
      q12_7: 'สุขอนามัย', q12_8: 'ปลอดภัย', q12_9: 'ดูแลฉุกเฉิน',
    };

    function buildServiceKPISheet(cfg) {
      const svcRows = rows.filter(x => x.service_type === cfg.key);
      const svcCount = svcRows.length;

      const sheet = workbook.addWorksheet(cfg.name, {
        properties: { tabColor: { argb: cfg.color } },
      });

      sheet.columns = [
        { width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
      ];

      let row = 1;

      // Title
      sheet.mergeCells(`A${row}:F${row}`);
      const tc = sheet.getCell(`A${row}`);
      tc.value = `${cfg.name} — สรุป KPI`;
      tc.font = { bold: true, size: 14, color: { argb: C.white }, name: 'Tahoma' };
      tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cfg.color } };
      tc.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(row).height = 36;
      row++;

      sheet.mergeCells(`A${row}:F${row}`);
      sheet.getCell(`A${row}`).value = `จำนวนผู้ตอบ: ${svcCount} คน | สัดส่วน: ${totalCount > 0 ? ((svcCount / totalCount) * 100).toFixed(1) : 0}% ของทั้งหมด`;
      sheet.getCell(`A${row}`).font = { size: 10, color: { argb: C.gray }, name: 'Tahoma' };
      sheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
      row += 2;

      // Helper to add section header
      function addSvcSection(title, sectionColor) {
        sheet.mergeCells(`A${row}:F${row}`);
        const c = sheet.getCell(`A${row}`);
        c.value = title;
        c.font = { bold: true, size: 11, color: { argb: C.white }, name: 'Tahoma' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sectionColor } };
        c.alignment = { horizontal: 'left', vertical: 'middle' };
        sheet.getRow(row).height = 26;
        row++;
      }

      // Helper to add a KPI row
      function addKPIRow(label, value, extra) {
        sheet.getCell(`A${row}`).value = label;
        sheet.getCell(`A${row}`).font = { ...defaultFont, bold: true };
        sheet.getCell(`B${row}`).value = value;
        sheet.getCell(`B${row}`).font = { ...defaultFont, bold: true, size: 12, color: { argb: cfg.color } };
        sheet.getCell(`B${row}`).alignment = { horizontal: 'center' };
        if (extra) {
          sheet.mergeCells(`C${row}:F${row}`);
          sheet.getCell(`C${row}`).value = extra;
          sheet.getCell(`C${row}`).font = { ...defaultFont, color: { argb: C.gray }, italic: true };
        }
        row++;
      }

      // ── 1. ข้อมูลทั่วไป ──
      addSvcSection('📋 ข้อมูลทั่วไป', C.teal);
      addKPIRow('จำนวนผู้ตอบ', svcCount + ' คน', `${totalCount > 0 ? ((svcCount / totalCount) * 100).toFixed(1) : 0}% ของทั้งหมด ${totalCount} คน`);

      // Gender distribution
      const genderCounts = {};
      svcRows.forEach(r => { genderCounts[r.gender] = (genderCounts[r.gender] || 0) + 1; });
      const genderStr = Object.entries(genderCounts).map(([g, c]) => `${g}: ${c}`).join(' | ');
      addKPIRow('เพศ', '', genderStr);

      // Wait time
      const svcWaitUnder15 = svcRows.filter(x => x.wait_time === 'น้อยกว่า 15 นาที' || x.wait_time === '<15').length;
      const svcWaitPct = svcCount > 0 ? ((svcWaitUnder15 / svcCount) * 100).toFixed(1) : 0;
      addKPIRow('เวลารอ < 15 นาที', svcWaitPct + '%', `${svcWaitUnder15} จาก ${svcCount} คน`);
      row++;

      // ── 2. คะแนนรายข้อ (service-specific) ──
      addSvcSection('⭐ คะแนนความพึงพอใจรายข้อ (เฉพาะแผนก)', cfg.color);

      // Table header
      ['ข้อคำถาม', 'คะแนนเฉลี่ย', 'คิดเป็น %', 'ระดับ'].forEach((h, i) => {
        const colLetter = ['A','B','C','D'][i];
        const cell = sheet.getCell(`${colLetter}${row}`);
        cell.value = h;
        cell.font = { bold: true, color: { argb: C.white }, size: 10, name: 'Tahoma' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.gray } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder;
      });
      row++;

      // Calculate per-question averages
      const allQKeys = [...cfg.scoreKeys, 'q12_1','q12_2','q12_3','q12_4','q12_5','q12_6','q12_7','q12_8','q12_9'];
      let totalQSum = 0, totalQCount = 0;

      allQKeys.forEach(k => {
        let sum = 0, count = 0;
        svcRows.forEach(r => {
          if (r[k] !== null && r[k] !== undefined) { sum += r[k]; count++; }
        });
        const avg = count > 0 ? sum / count : 0;
        const pct = (avg / 5 * 100).toFixed(1);
        const level = avg >= 4.5 ? 'ดีมาก' : avg >= 3.5 ? 'ดี' : avg >= 2.5 ? 'ปานกลาง' : 'ต้องปรับปรุง';
        const label = questionLabels[k] || k;
        const isQ12 = k.startsWith('q12');

        sheet.getCell(`A${row}`).value = `${label} (${k})`;
        sheet.getCell(`A${row}`).font = defaultFont;
        sheet.getCell(`B${row}`).value = avg.toFixed(2);
        sheet.getCell(`B${row}`).font = { ...defaultFont, bold: true };
        sheet.getCell(`B${row}`).alignment = { horizontal: 'center' };
        sheet.getCell(`C${row}`).value = pct + '%';
        sheet.getCell(`C${row}`).alignment = { horizontal: 'center' };
        sheet.getCell(`C${row}`).font = defaultFont;
        sheet.getCell(`D${row}`).value = level;
        sheet.getCell(`D${row}`).font = defaultFont;
        sheet.getCell(`D${row}`).alignment = { horizontal: 'center' };

        // Color code
        const cellColor = avg >= 4.5 ? C.greenLight : avg >= 3.5 ? 'FFDCFCE7' : avg >= 2.5 ? C.amberLight : 'FFFECACA';
        ['A','B','C','D'].forEach(col => {
          sheet.getCell(`${col}${row}`).border = thinBorder;
          if (isQ12) {
            sheet.getCell(`${col}${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.blueLight } };
          }
        });
        sheet.getCell(`D${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cellColor } };

        totalQSum += avg;
        totalQCount++;
        row++;
      });

      // Average row
      const grandAvg = totalQCount > 0 ? totalQSum / totalQCount : 0;
      sheet.getCell(`A${row}`).value = '📊 ค่าเฉลี่ยรวมทุกข้อ';
      sheet.getCell(`A${row}`).font = { ...defaultFont, bold: true, size: 11 };
      sheet.getCell(`B${row}`).value = grandAvg.toFixed(2);
      sheet.getCell(`B${row}`).font = { ...defaultFont, bold: true, size: 12, color: { argb: cfg.color } };
      sheet.getCell(`B${row}`).alignment = { horizontal: 'center' };
      sheet.getCell(`C${row}`).value = (grandAvg / 5 * 100).toFixed(1) + '%';
      sheet.getCell(`C${row}`).font = { ...defaultFont, bold: true };
      sheet.getCell(`C${row}`).alignment = { horizontal: 'center' };
      const grandLevel = grandAvg >= 4.5 ? 'ดีมาก' : grandAvg >= 3.5 ? 'ดี' : grandAvg >= 2.5 ? 'ปานกลาง' : 'ต้องปรับปรุง';
      sheet.getCell(`D${row}`).value = grandLevel;
      sheet.getCell(`D${row}`).font = { ...defaultFont, bold: true };
      sheet.getCell(`D${row}`).alignment = { horizontal: 'center' };
      ['A','B','C','D'].forEach(col => {
        sheet.getCell(`${col}${row}`).border = thinBorder;
        sheet.getCell(`${col}${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.grayLight } };
      });
      row += 2;

      // ── 3. NPS & ความคาดหวัง ──
      addSvcSection('🎯 NPS & ความคาดหวัง', C.blue);

      let svcPromoters = 0, svcPassives = 0, svcDetractors = 0;
      svcRows.forEach(r => {
        if (r.q19 !== null && r.q19 !== undefined) {
          if (r.q19 >= 9) svcPromoters++;
          else if (r.q19 >= 7) svcPassives++;
          else svcDetractors++;
        }
      });
      const svcNpsTotal = svcPromoters + svcPassives + svcDetractors;
      const svcNps = svcNpsTotal > 0 ? Math.round(((svcPromoters - svcDetractors) / svcNpsTotal) * 100) : 0;
      addKPIRow('NPS Score', (svcNps > 0 ? '+' : '') + svcNps, `Promoters: ${svcPromoters} | Passives: ${svcPassives} | Detractors: ${svcDetractors}`);

      // Expectation before/after
      let q15Sum = 0, q15Count = 0, q16Sum = 0, q16Count = 0;
      svcRows.forEach(r => {
        if (r.q15 !== null && r.q15 !== undefined) { q15Sum += r.q15; q15Count++; }
        if (r.q16 !== null && r.q16 !== undefined) { q16Sum += r.q16; q16Count++; }
      });
      const q15Avg = q15Count > 0 ? q15Sum / q15Count : 0;
      const q16Avg = q16Count > 0 ? q16Sum / q16Count : 0;
      addKPIRow('คาดหวังก่อนใช้บริการ (Q15)', q15Avg.toFixed(2) + ' / 10', `${q15Count} คนตอบ`);
      addKPIRow('คาดหวังหลังใช้บริการ (Q16)', q16Avg.toFixed(2) + ' / 10', `${q16Count} คนตอบ — ${q16Avg > q15Avg ? '✅ สูงกว่าก่อนรับบริการ' : '⚠️ ต่ำกว่าก่อนรับบริการ'}`);

      // Reuse intention (Q20)
      let q21Sum = 0, q21Count = 0;
      svcRows.forEach(r => { if (r.q21 !== null && r.q21 !== undefined) { q21Sum += r.q21; q21Count++; } });
      const q21Avg = q21Count > 0 ? q21Sum / q21Count : 0;
      addKPIRow('แนวโน้มใช้บริการซ้ำ (Q21)', q21Avg.toFixed(2) + ' / 10', `${q21Count} คนตอบ`);
      row++;

      // ── 4. ข้อเสนอแนะล่าสุด ──
      addSvcSection('💬 ข้อเสนอแนะล่าสุด', C.gray);
      const feedbacks = svcRows.filter(r => r.q17 && r.q17.trim()).slice(0, 8);
      if (feedbacks.length === 0) {
        addKPIRow('—', 'ไม่มีข้อเสนอแนะ', '');
      } else {
        feedbacks.forEach((fb, i) => {
          sheet.getCell(`A${row}`).value = `${i + 1}. ${fb.q17}`;
          sheet.getCell(`A${row}`).font = defaultFont;
          sheet.mergeCells(`A${row}:F${row}`);
          row++;
        });
      }
      row++;

      // ── 5. ต้องการบริการเพิ่มเติม (Q18) ──
      addSvcSection('🔧 ต้องการบริการเพิ่มเติม (Q18)', C.blue);
      const q18List = svcRows.filter(r => r.q18 && r.q18.trim()).slice(0, 8);
      if (q18List.length === 0) {
        addKPIRow('—', 'ไม่มีคำตอบ', '');
      } else {
        q18List.forEach((fb, i) => {
          sheet.getCell(`A${row}`).value = `${i + 1}. ${fb.q18}`;
          sheet.getCell(`A${row}`).font = defaultFont;
          sheet.mergeCells(`A${row}:F${row}`);
          row++;
        });
      }
    }

    // Build 3 service KPI sheets
    serviceConfigs.forEach(cfg => buildServiceKPISheet(cfg));

    // ══════════════════════════════════════════════════════════════════════
    // SHEET 2: ข้อมูลดิบ (Raw Data)
    // ══════════════════════════════════════════════════════════════════════
    const s2 = workbook.addWorksheet('📋 ข้อมูลดิบ', {
      properties: { tabColor: { argb: C.blue } },
      views: [{ state: 'frozen', ySplit: 2 }],   // freeze top 2 rows
    });

    // Row 1: Section group headers
    const groupHeaders = [
      { label: 'ข้อมูลทั่วไป', cols: 7, color: C.teal },
      { label: 'กายภาพบำบัด (q6-q7)', cols: 9, color: C.green },
      { label: 'ฟิตเนส (q8-q9)', cols: 7, color: C.amber },
      { label: 'ธาราบำบัด (q10-q11)', cols: 7, color: C.purple },
      { label: 'สถานที่/ความปลอดภัย (q12)', cols: 9, color: C.blue },
      { label: 'ข้อมูลเพิ่มเติม (q13-q21)', cols: 9, color: C.gray },
    ];

    let colIdx = 1;
    groupHeaders.forEach(g => {
      const startCol = colIdx;
      const endCol = colIdx + g.cols - 1;
      if (g.cols > 1) s2.mergeCells(1, startCol, 1, endCol);
      const cell = s2.getCell(1, startCol);
      cell.value = g.label;
      cell.font = { bold: true, color: { argb: C.white }, size: 10, name: 'Tahoma' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: g.color } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
      colIdx = endCol + 1;
    });
    s2.getRow(1).height = 24;

    // Row 2: Column headers
    const colDefs = [
      // ข้อมูลทั่วไป (7)
      { header: 'ID', key: 'id', width: 6 },
      { header: 'ประเภทบริการ', key: 'service_type', width: 18 },
      { header: 'วันที่', key: 'created_at', width: 18 },
      { header: 'เพศ', key: 'gender', width: 10 },
      { header: 'อายุ', key: 'age', width: 6 },
      { header: 'อาชีพ', key: 'occupation', width: 14 },
      { header: 'เวลารอ', key: 'wait_time', width: 14 },
      // กายภาพบำบัด (9)
      { header: 'นัดหมาย\nสะดวก', key: 'q6_1', width: 10 },
      { header: 'นัดหมาย\nรวดเร็ว', key: 'q6_2', width: 10 },
      { header: 'นัดหมาย\nยืดหยุ่น', key: 'q6_3', width: 10 },
      { header: 'สุภาพ\nจิตบริการ', key: 'q7_1', width: 10 },
      { header: 'เปิดโอกาส\nซักถาม', key: 'q7_2', width: 10 },
      { header: 'อธิบาย\nชัดเจน', key: 'q7_3', width: 10 },
      { header: 'ความรู้\nทักษะ', key: 'q7_4', width: 10 },
      { header: 'ประสิทธิภาพ\nรักษา', key: 'q7_5', width: 10 },
      { header: 'พึงพอใจ\nPT รวม', key: 'q7_6', width: 10 },
      // ฟิตเนส (7)
      { header: 'นัดหมาย\nสะดวก', key: 'q8_1', width: 10 },
      { header: 'นัดหมาย\nรวดเร็ว', key: 'q8_2', width: 10 },
      { header: 'นัดหมาย\nยืดหยุ่น', key: 'q8_3', width: 10 },
      { header: 'สุภาพ\nจิตบริการ', key: 'q9_1', width: 10 },
      { header: 'เปิดโอกาส\nซักถาม', key: 'q9_2', width: 10 },
      { header: 'อธิบาย\nชัดเจน', key: 'q9_3', width: 10 },
      { header: 'พึงพอใจ\nFit รวม', key: 'q9_4', width: 10 },
      // ธาราบำบัด (7)
      { header: 'นัดหมาย\nสะดวก', key: 'q10_1', width: 10 },
      { header: 'นัดหมาย\nรวดเร็ว', key: 'q10_2', width: 10 },
      { header: 'นัดหมาย\nยืดหยุ่น', key: 'q10_3', width: 10 },
      { header: 'สุภาพ\nจิตบริการ', key: 'q11_1', width: 10 },
      { header: 'เปิดโอกาส\nซักถาม', key: 'q11_2', width: 10 },
      { header: 'อธิบาย\nชัดเจน', key: 'q11_3', width: 10 },
      { header: 'พึงพอใจ\nHydro รวม', key: 'q11_4', width: 10 },
      // สถานที่ (9)
      { header: 'สะอาด\nระเบียบ', key: 'q12_1', width: 10 },
      { header: 'สะดวก\nเข้าถึง', key: 'q12_2', width: 10 },
      { header: 'พร้อม\nอุปกรณ์', key: 'q12_3', width: 10 },
      { header: 'สวยงาม', key: 'q12_4', width: 10 },
      { header: 'บรรยากาศ\nผ่อนคลาย', key: 'q12_5', width: 10 },
      { header: 'เงียบสงบ\nส่วนตัว', key: 'q12_6', width: 10 },
      { header: 'สุขอนามัย', key: 'q12_7', width: 10 },
      { header: 'ปลอดภัย', key: 'q12_8', width: 10 },
      { header: 'ดูแล\nฉุกเฉิน', key: 'q12_9', width: 10 },
      // ข้อมูลเพิ่มเติม (7)
      { header: 'ข้อเสนอแนะ', key: 'q13', width: 30 },
      { header: 'ช่องทาง\nข่าวสาร', key: 'q14', width: 18 },
      { header: 'คาดหวัง\nก่อน', key: 'q15', width: 10 },
      { header: 'คาดหวัง\nหลัง', key: 'q16', width: 10 },
      { header: 'ความประทับใจ', key: 'q17', width: 30 },
      { header: 'ต้องการบริการ\nเพิ่มเติม', key: 'q18', width: 30 },
      { header: 'แนะนำ\nผู้อื่น', key: 'q19', width: 10 },
      { header: 'เหตุผล', key: 'q20', width: 30 },
      { header: 'ใช้บริการ\nใหม่', key: 'q21', width: 10 },
    ];

    s2.columns = colDefs.map(d => ({ key: d.key, width: d.width }));

    // Write header row (row 2)
    const headerRow2 = s2.getRow(2);
    colDefs.forEach((d, i) => {
      headerRow2.getCell(i + 1).value = d.header;
    });

    // Style header row 2 with section-specific colors
    const sectionColorMap = [];
    groupHeaders.forEach(g => { for (let i = 0; i < g.cols; i++) sectionColorMap.push(g.color); });

    headerRow2.height = 36;
    headerRow2.eachCell((cell, colNumber) => {
      const bgColor = sectionColorMap[colNumber - 1] || C.gray;
      cell.font = { bold: true, color: { argb: C.white }, size: 9, name: 'Tahoma' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    });

    // Add data rows starting from row 3
    rows.forEach((row) => {
      const dataRow = { ...row };
      // Translate service_type to Thai
      if (svcNameTh[dataRow.service_type]) dataRow.service_type = svcNameTh[dataRow.service_type];
      s2.addRow(dataRow);
    });

    // Style data rows with alternating colors
    styleDataRows(s2, 3, C.grayAlt);

    // Color-code score cells (1=red, 2=orange, 3=yellow, 4=lime, 5=green)
    const scoreColorMap = {
      1: 'FFFECACA', 2: 'FFFED7AA', 3: 'FFFEF08A', 4: 'FFBBF7D0', 5: 'FF86EFAC',
    };
    const scoreColIndices = [];
    colDefs.forEach((d, i) => {
      if (d.key.match(/^q\d+_\d+$/)) scoreColIndices.push(i + 1);
    });

    for (let i = 3; i <= s2.rowCount; i++) {
      const row = s2.getRow(i);
      scoreColIndices.forEach(ci => {
        const cell = row.getCell(ci);
        const v = cell.value;
        if (v !== null && v !== undefined && scoreColorMap[v]) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: scoreColorMap[v] } };
        }
      });
    }

    // Auto-filter on row 2
    s2.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: colDefs.length } };

    // ══════════════════════════════════════════════════════════════════════
    // SHEET 3: คำอธิบายคำถาม (Legend)
    // ══════════════════════════════════════════════════════════════════════
    const s3 = workbook.addWorksheet('📝 คำอธิบายคำถาม', {
      properties: { tabColor: { argb: C.amber } },
    });

    s3.columns = [
      { header: 'รหัสคำถาม', key: 'code', width: 14 },
      { header: 'หมวด', key: 'section', width: 22 },
      { header: 'คำอธิบาย', key: 'desc', width: 50 },
      { header: 'ช่วงคะแนน', key: 'scale', width: 14 },
    ];

    const legendData = [
      { code: 'q6_1-q6_3', section: 'กายภาพบำบัด', desc: 'ความพึงพอใจด้านการนัดหมาย (สะดวก, รวดเร็ว, ยืดหยุ่น)', scale: '1-5' },
      { code: 'q7_1-q7_6', section: 'กายภาพบำบัด', desc: 'ความพึงพอใจด้านผู้ให้บริการ (จิตบริการ, ซักถาม, อธิบาย, ทักษะ, ประสิทธิภาพ, ภาพรวม)', scale: '1-5' },
      { code: 'q8_1-q8_3', section: 'ฟิตเนสและซาวน่า', desc: 'ความพึงพอใจด้านการนัดหมาย', scale: '1-5' },
      { code: 'q9_1-q9_4', section: 'ฟิตเนสและซาวน่า', desc: 'ความพึงพอใจด้านผู้ให้บริการ', scale: '1-5' },
      { code: 'q10_1-q10_3', section: 'ธาราบำบัด', desc: 'ความพึงพอใจด้านการนัดหมาย', scale: '1-5' },
      { code: 'q11_1-q11_4', section: 'ธาราบำบัด', desc: 'ความพึงพอใจด้านผู้ให้บริการ', scale: '1-5' },
      { code: 'q12_1-q12_9', section: 'ทุกแผนก', desc: 'สถานที่/สิ่งอำนวยความสะดวก/ความปลอดภัย (สะอาด, เข้าถึง, อุปกรณ์, สวยงาม, ผ่อนคลาย, ส่วนตัว, สุขอนามัย, ปลอดภัย, ฉุกเฉิน)', scale: '1-5' },
      { code: 'q13', section: 'ทุกแผนก', desc: 'ข้อเสนอแนะเพิ่มเติม (ข้อความ)', scale: 'ข้อความ' },
      { code: 'q14', section: 'ทุกแผนก', desc: 'ช่องทางการรับข่าวสาร', scale: 'ข้อความ' },
      { code: 'q15', section: 'ทุกแผนก', desc: 'ระดับความคาดหวังก่อนใช้บริการ', scale: '0-10' },
      { code: 'q16', section: 'ทุกแผนก', desc: 'ระดับความคาดหวังหลังใช้บริการ', scale: '0-10' },
      { code: 'q17', section: 'ทุกแผนก', desc: 'สิ่งที่ประทับใจหรืออยากให้ปรับปรุง (ข้อความ)', scale: 'ข้อความ' },
      { code: 'q18', section: 'ทุกแผนก', desc: 'ต้องการบริการเพิ่มเติม (เช่น บริการอื่นๆ เครื่องมือ อุปกรณ์)', scale: 'ข้อความ' },
      { code: 'q19', section: 'ทุกแผนก (NPS)', desc: 'แนะนำบริการนี้ให้ผู้อื่นหรือไม่ (0=ไม่เลย, 10=แน่นอน)', scale: '0-10' },
      { code: 'q20', section: 'ทุกแผนก', desc: 'เหตุผลสำคัญที่ทำให้ให้คะแนนแนะนำผู้อื่น', scale: 'ข้อความ' },
      { code: 'q21', section: 'ทุกแผนก', desc: 'กลับมาใช้บริการใหม่หรือไม่ (0=ไม่เลย, 10=แน่นอน)', scale: '0-10' },
    ];

    legendData.forEach(d => s3.addRow(d));

    styleHeader(s3.getRow(1), C.amber);
    styleDataRows(s3, 2, C.amberLight);

    // ── Send the file ──
    const today = new Date();
    const dateStr = today.getFullYear().toString()
      + String(today.getMonth() + 1).padStart(2, '0')
      + String(today.getDate()).padStart(2, '0');
    const filename = `survey_data_${dateStr}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting Excel:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to export Excel file',
    });
  }
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🏥 AHS Survey Server is running!`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`   Database: ${path.join(dataDir, 'survey.db')}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
