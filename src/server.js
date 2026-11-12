require('dotenv').config();
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('./db');
const sarvamService = require('./services/sarvamService');
const { redactSensitiveText } = require('./services/privacy');
const { requireAuth, requireAdmin } = require('./middleware/auth');

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || 'development-secret';
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
const uploadDir = path.resolve(process.env.UPLOAD_DIR || (process.env.VERCEL ? '/tmp/campus-lost-found-uploads' : 'uploads'));
fs.mkdirSync(uploadDir, { recursive: true });

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});
app.use(express.json());
app.use(express.static(path.resolve('public')));

app.get('/health', (_req, res) => {
  try {
    db.prepare('SELECT 1 AS ok').get();
    res.json({ status: 'ok', database: 'ok' });
  } catch (error) {
    console.error(JSON.stringify({ event: 'health_check_failed', error: error.message }));
    res.status(503).json({ status: 'degraded', database: 'unavailable' });
  }
});

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 8) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      return cb(new Error('Only JPG, JPEG, and PNG images are supported.'));
    }
    cb(null, true);
  }
});

function rateLimit(limit, windowMs) {
  const clients = new Map();
  return (req, res, next) => {
    const nowMs = Date.now();
    const key = req.ip || 'unknown';
    const current = clients.get(key);
    if (!current || nowMs >= current.resetAt) {
      clients.set(key, { count: 1, resetAt: nowMs + windowMs });
      return next();
    }
    if (current.count >= limit) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - nowMs) / 1000));
      return res.status(429).json({ error: 'Too many requests. Please try again later.', requestId: req.requestId });
    }
    current.count += 1;
    next();
  };
}

const rateLimitWindow = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
app.use('/api/v1/auth', rateLimit(Number(process.env.AUTH_RATE_LIMIT || 30), rateLimitWindow));
app.use('/api/v1/ai', rateLimit(Number(process.env.AI_RATE_LIMIT || 20), rateLimitWindow));
app.use('/api/v1/reports', rateLimit(Number(process.env.REPORT_RATE_LIMIT || 30), rateLimitWindow));

const reportSchema = z.object({
  reportType: z.enum(['LOST', 'FOUND']),
  title: z.string().trim().max(120).optional().default(''),
  category: z.string().trim().max(60).optional().default(''),
  description: z.string().trim().max(2000).optional().default(''),
  brandOrIdentifyingText: z.string().trim().max(300).optional().default(''),
  condition: z.string().trim().max(120).optional().default(''),
  accessories: z.string().trim().max(500).optional().default(''),
  colour: z.string().trim().max(80).optional().default(''),
  locationText: z.string().trim().min(2).max(160),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  approximateTime: z.string().trim().max(20).optional().default(''),
  custodyLocation: z.string().trim().max(160).optional().default(''),
  contactPreference: z.enum(['IN_APP', 'EMAIL', 'ADMIN_MEDIATED']).default('IN_APP'),
  tags: z.string().trim().max(500).optional().default('')
});

function now() {
  return new Date().toISOString();
}

function seedDemoData() {
  if (process.env.DEMO_DATA !== 'true') return;
  if (db.prepare('SELECT COUNT(*) AS count FROM reports').get().count > 0) return;

  const demoUserId = 'demo-campus-user';
  const demoReports = [
    ['FOUND', 'Navy blue water bottle', 'Water bottle', 'Navy blue', 'Central Library, second floor', -1, 'Security desk', 'blue, bottle, metal, black cap'],
    ['LOST', 'Black wireless earbuds case', 'Electronics', 'Black', 'SAC canteen', -2, '', 'black, earbuds, case, wireless'],
    ['FOUND', 'Brown leather wallet', 'Wallet', 'Brown', 'Lecture Hall 3', -3, 'Lost and Found desk', 'brown, leather, wallet, cards'],
    ['LOST', 'Blue IIITA identity card holder', 'ID card', 'Blue', 'Rajendra Bhawan entrance', -4, '', 'blue, id card, holder, lanyard'],
    ['FOUND', 'Grey Lenovo laptop charger', 'Charger', 'Grey', 'Computer Centre lab 2', -5, 'Computer Centre reception', 'grey, charger, lenovo, laptop'],
    ['LOST', 'Green spiral notebook', 'Book', 'Green', 'Academic Block corridor', -6, '', 'green, notebook, spiral, notes']
  ];

  transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO users
      (id, college_email, password_hash, full_name, role, created_at)
      VALUES (?, ?, ?, ?, 'USER', ?)
    `).run(demoUserId, 'demo@college.edu', bcrypt.hashSync('demo-password', 10), 'Demo Campus User', now());

    for (const [reportType, title, category, colour, location, daysAgo, custodyLocation, tags] of demoReports) {
      const reportId = crypto.randomUUID();
      const date = new Date(Date.now() + daysAgo * 86400000).toISOString().slice(0, 10);
      db.prepare(`
        INSERT INTO reports
        (id, reporter_id, report_type, title, category, description, colour, location_text,
         event_date, approximate_time, custody_location, contact_preference, status,
         image_path, ai_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_APP', 'ACTIVE', NULL, 'DISABLED', ?, ?)
      `).run(
        reportId,
        demoUserId,
        reportType,
        title,
        category,
        `Demonstration ${reportType.toLowerCase()} report for the campus portal.`,
        colour,
        location,
        date,
        'Around 2:30 PM',
        custodyLocation,
        now(),
        now()
      );
      for (const tag of tags.split(', ')) {
        db.prepare('INSERT INTO tags (report_id, tag, source) VALUES (?, ?, ?)')
          .run(reportId, tag, 'USER');
      }
      db.prepare('INSERT INTO status_history (report_id, previous_status, new_status, changed_by, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(reportId, 'DRAFT', 'ACTIVE', demoUserId, now());
    }
  });
}

seedDemoData();

function transaction(callback) {
  db.exec('BEGIN');
  try {
    callback();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function publicReport(row) {
  return {
    id: row.id,
    reportType: row.report_type,
    title: row.title,
    category: row.category,
    description: row.description,
    brandOrIdentifyingText: row.brand_or_identifying_text || '',
    condition: row.condition || '',
    accessories: row.accessories ? JSON.parse(row.accessories) : [],
    aiDescription: row.ai_description,
    aiDetails: {
      detailedDescription: row.ai_detailed_description || '',
      brandOrIdentifyingText: row.ai_brand_or_identifying_text || '',
      condition: row.ai_condition || '',
      accessories: row.ai_accessories ? JSON.parse(row.ai_accessories) : [],
      responseMetadata: row.ai_response_metadata ? JSON.parse(row.ai_response_metadata) : null
    },
    colour: row.colour,
    locationText: row.location_text,
    eventDate: row.event_date,
    approximateTime: row.approximate_time,
    custodyLocation: row.custody_location,
    status: row.status,
    imageUrl: row.image_path ? `/uploads/${path.basename(row.image_path)}` : null,
    aiStatus: row.ai_status,
    aiConfidence: row.ai_confidence,
    reporterName: row.reporter_name,
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function signUser(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.college_email }, jwtSecret, { expiresIn: jwtExpiresIn });
}

function adminEmails() {
  return new Set(String(process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

function seedConfiguredAdmin() {
  const email = [...adminEmails()][0];
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !password) return;

  const existing = db.prepare('SELECT id FROM users WHERE college_email = ?').get(email);
  if (existing) {
    db.prepare('UPDATE users SET role = ?, is_active = 1 WHERE id = ?').run('ADMIN', existing.id);
    return;
  }

  db.prepare(`
    INSERT INTO users (id, college_email, password_hash, full_name, role, is_active, created_at)
    VALUES (?, ?, ?, ?, 'ADMIN', 1, ?)
  `).run(crypto.randomUUID(), email, bcrypt.hashSync(password, 12), 'Campus Administrator', now());
}

seedConfiguredAdmin();

function createNotification(userId, reportId, message) {
  db.prepare('INSERT INTO notifications (id, user_id, report_id, message, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(crypto.randomUUID(), userId, reportId, message, now());
}

function audit(actorId, action, entityType, entityId, metadata = {}) {
  db.prepare('INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(actorId, action, entityType, entityId, JSON.stringify(metadata), now());
}

function tokens(value) {
  return new Set(String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
}

function reportTerms(report, tags = []) {
  const tagValues = Array.isArray(tags) ? tags : String(tags || '').split(',');
  return new Set([
    ...tokens(report.title),
    ...tokens(report.category),
    ...tokens(report.description),
    ...tokens(report.colour),
    ...tokens(report.ai_description),
    ...tagValues.flatMap((tag) => [...tokens(tag)])
  ]);
}

function similarityScore(left, right) {
  const leftTerms = reportTerms(left, left.tags || []);
  const rightTerms = reportTerms(right, right.tags || []);
  const shared = [...leftTerms].filter((term) => rightTerms.has(term));
  const unionSize = new Set([...leftTerms, ...rightTerms]).size;
  const keywordScore = unionSize ? shared.length / unionSize : 0;
  const categoryBoost = left.category.toLowerCase() === right.category.toLowerCase() ? 0.25 : 0;
  const colourBoost = left.colour && right.colour && left.colour.toLowerCase() === right.colour.toLowerCase() ? 0.15 : 0;
  return Math.min(1, keywordScore + categoryBoost + colourBoost);
}

function createPotentialMatches(lostReportId) {
  const lost = db.prepare(`
    SELECT r.*, (SELECT GROUP_CONCAT(tag, ',') FROM tags WHERE report_id = r.id) AS tags
    FROM reports r WHERE r.id = ?
  `).get(lostReportId);
  if (!lost || lost.report_type !== 'LOST') return [];

  const foundReports = db.prepare(`
    SELECT r.*, u.full_name AS reporter_name,
      (SELECT GROUP_CONCAT(tag, ',') FROM tags WHERE report_id = r.id) AS tags
    FROM reports r JOIN users u ON u.id = r.reporter_id
    WHERE r.report_type = 'FOUND' AND r.status IN ('ACTIVE', 'MATCHED')
  `).all();
  const matches = [];

  for (const found of foundReports) {
    const score = similarityScore(lost, found);
    if (score < 0.25) continue;
    const matchId = crypto.randomUUID();
    db.prepare(`
      INSERT OR IGNORE INTO matches
      (id, lost_report_id, found_report_id, keyword_score, semantic_score, combined_score, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(matchId, lost.id, found.id, score, score, now());
    const stored = db.prepare('SELECT id FROM matches WHERE lost_report_id = ? AND found_report_id = ?').get(lost.id, found.id);
    createNotification(lost.reporter_id, found.id, `Potential found-item match: "${found.title}" (${Math.round(score * 100)}% relevance).`);
    createNotification(found.reporter_id, lost.id, `A new lost-item report may match your found item: "${lost.title}".`);
    matches.push({ id: stored.id, reportId: found.id, title: found.title, score: Number(score.toFixed(2)), reportType: 'FOUND' });
  }
  return matches;
}

app.post('/api/v1/auth/register', async (req, res) => {
  const parsed = z.object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(100)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid name, college email, and password of at least 8 characters.' });

  const domain = process.env.COLLEGE_EMAIL_DOMAIN;
  if (domain && !parsed.data.email.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
    return res.status(400).json({ error: `Use your approved @${domain} college email.` });
  }

  try {
    const user = {
      id: crypto.randomUUID(),
      email: parsed.data.email.toLowerCase(),
      fullName: parsed.data.fullName,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      role: adminEmails().has(parsed.data.email.toLowerCase()) ? 'ADMIN' : 'USER'
    };
    db.prepare('INSERT INTO users (id, college_email, password_hash, full_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(user.id, user.email, user.passwordHash, user.fullName, user.role, now());
    return res.status(201).json({ token: signUser({ id: user.id, role: user.role, college_email: user.email }), user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role } });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'An account with this email already exists.' });
    throw error;
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  const user = db.prepare('SELECT * FROM users WHERE college_email = ? AND is_active = 1').get(parsed.data.email.toLowerCase());
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  return res.json({ token: signUser(user), user: { id: user.id, fullName: user.full_name, email: user.college_email, role: user.role } });
});

app.get('/api/v1/users/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, college_email, full_name, role FROM users WHERE id = ?').get(req.user.id);
  res.json({ id: user.id, email: user.college_email, fullName: user.full_name, role: user.role });
});

app.get('/api/v1/reports', (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase();
  const params = [];
  const where = [`r.status NOT IN ('REMOVED', 'EXPIRED')`];
  if (req.query.type && ['LOST', 'FOUND'].includes(req.query.type)) {
    where.push('r.report_type = ?'); params.push(req.query.type);
  }
  if (req.query.category) {
    where.push('LOWER(r.category) = LOWER(?)'); params.push(req.query.category);
  }
  if (req.query.status) {
    where.push('r.status = ?'); params.push(req.query.status);
  }
  if (req.query.location) {
    where.push('LOWER(r.location_text) LIKE LOWER(?)'); params.push(`%${req.query.location}%`);
  }
  if (req.query.colour) {
    where.push('LOWER(COALESCE(r.colour, \'\')) LIKE LOWER(?)'); params.push(`%${req.query.colour}%`);
  }
  if (req.query.dateFrom) {
    where.push('r.event_date >= ?'); params.push(req.query.dateFrom);
  }
  if (req.query.dateTo) {
    where.push('r.event_date <= ?'); params.push(req.query.dateTo);
  }
  if (query) {
    const terms = query.split(/\s+/).filter(Boolean);
    for (const word of terms) {
      where.push(`(LOWER(r.title) LIKE ? OR LOWER(r.description) LIKE ? OR LOWER(COALESCE(r.ai_description, '')) LIKE ? OR EXISTS (
        SELECT 1 FROM tags t WHERE t.report_id = r.id AND LOWER(t.tag) LIKE ?
      ))`);
      const term = `%${word}%`; params.push(term, term, term, term);
    }
  }

  const rows = db.prepare(`
    SELECT r.*, u.full_name AS reporter_name,
      (SELECT GROUP_CONCAT(tag, ',') FROM tags WHERE report_id = r.id) AS tags
    FROM reports r JOIN users u ON u.id = r.reporter_id
    WHERE ${where.join(' AND ')}
    ORDER BY r.created_at DESC LIMIT 100
  `).all(...params);
  res.json({ results: rows.map(publicReport) });
});

app.post('/api/v1/ai/describe', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'An item image is required.' });
  try {
    const result = await sarvamService.generateItemDescription(req.file);
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: 'Sarvam could not analyze this image. You can enter the details manually.' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.post('/api/v1/reports', requireAuth, upload.single('image'), async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Complete all required report fields correctly.', details: parsed.error.flatten() });
  if (!req.file) return res.status(400).json({ error: 'An item image is required.' });

  const data = parsed.data;
  data.description = redactSensitiveText(data.description);
  data.brandOrIdentifyingText = redactSensitiveText(data.brandOrIdentifyingText);
  data.tags = data.tags.split(',').map((value) => redactSensitiveText(value)).join(',');
  const id = crypto.randomUUID();
  const timestamp = now();
  let aiStatus = process.env.AI_ENABLED === 'true' ? 'PENDING' : 'DISABLED';
  let aiDescription = null;
  let aiDetailedDescription = null;
  let aiBrandOrIdentifyingText = null;
  let aiCondition = null;
  let aiAccessories = [];
  let aiResponseMetadata = null;
  let aiModel = null;
  let aiConfidence = null;
  let aiTags = [];

  try {
    const ai = await sarvamService.generateItemDescription(req.file);
    aiStatus = ai.status === 'SUCCEEDED' ? ai.status : 'FAILED';
    aiResponseMetadata = {
      model: ai.model || null,
      latencyMs: ai.latencyMs ?? null,
      confidence: ai.confidence ?? null
    };
    aiModel = ai.model || null;
    aiConfidence = ai.confidence ?? null;
    if (ai.status === 'SUCCEEDED') {
      aiDescription = ai.short_description || null;
      aiDetailedDescription = ai.detailed_description || null;
      aiBrandOrIdentifyingText = ai.brand_or_identifying_text || null;
      aiCondition = ai.condition || null;
      aiAccessories = Array.isArray(ai.accessories) ? ai.accessories : [];
      aiTags = Array.isArray(ai.search_keywords) ? ai.search_keywords : [];
      if (!data.title) data.title = ai.short_description || 'Unidentified item';
      if (!data.category) data.category = ai.item_category || 'Other';
      if (!data.description) data.description = ai.detailed_description || ai.short_description || '';
      if (!data.brandOrIdentifyingText) data.brandOrIdentifyingText = ai.brand_or_identifying_text || '';
      if (!data.condition) data.condition = ai.condition || '';
      if (!data.accessories) data.accessories = ai.accessories.join(', ');
      if (!data.colour) data.colour = ai.colour || '';
    }
  } catch {
    aiStatus = 'FAILED';
  }
  if (!data.title) data.title = 'Unidentified item';
  if (!data.category) data.category = 'Other';

  transaction(() => {
    db.prepare(`
      INSERT INTO reports
      (id, reporter_id, report_type, title, category, description, brand_or_identifying_text,
       condition, accessories, ai_description,
       ai_detailed_description, ai_brand_or_identifying_text, ai_condition, ai_accessories,
       ai_response_metadata, colour,
       location_text, event_date, approximate_time, custody_location, contact_preference,
       status, image_path, ai_status, ai_model, ai_confidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, data.reportType, data.title, data.category, data.description,
      data.brandOrIdentifyingText, data.condition,
      JSON.stringify(data.accessories.split(',').map((value) => value.trim()).filter(Boolean)),
      aiDescription, aiDetailedDescription, aiBrandOrIdentifyingText, aiCondition,
      JSON.stringify(aiAccessories), JSON.stringify(aiResponseMetadata), data.colour,
      data.locationText, data.eventDate, data.approximateTime,
      data.custodyLocation, data.contactPreference, req.file.path, aiStatus, aiModel,
      aiConfidence, timestamp, timestamp);

    const tags = [...new Set([
      ...data.tags.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
      ...aiTags.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    ])];
    for (const tag of tags) {
      db.prepare('INSERT INTO tags (report_id, tag, source) VALUES (?, ?, ?)')
        .run(id, tag, 'USER');
    }
    db.prepare('INSERT INTO status_history (report_id, previous_status, new_status, changed_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'DRAFT', 'ACTIVE', req.user.id, timestamp);
  });
  const potentialMatches = data.reportType === 'LOST' ? createPotentialMatches(id) : [];
  if (potentialMatches.length > 0) {
    transaction(() => {
      db.prepare('UPDATE reports SET status = ?, updated_at = ? WHERE id = ?').run('MATCHED', now(), id);
      db.prepare('INSERT INTO status_history (report_id, previous_status, new_status, changed_by, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, 'ACTIVE', 'MATCHED', req.user.id, now());
      audit(req.user.id, 'MATCHES_CREATED', 'REPORT', id, { count: potentialMatches.length });
    });
  }
  const row = db.prepare(`
    SELECT r.*, u.full_name AS reporter_name,
      (SELECT GROUP_CONCAT(tag, ',') FROM tags WHERE report_id = r.id) AS tags
    FROM reports r JOIN users u ON u.id = r.reporter_id WHERE r.id = ?
  `).get(id);
  res.status(201).json({ ...publicReport(row), potentialMatches });
});

app.patch('/api/v1/reports/:id/status', requireAuth, (req, res) => {
  const parsed = z.object({ status: z.enum(['ACTIVE', 'MATCHED', 'CLAIMED', 'RESOLVED', 'EXPIRED', 'REMOVED']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid status.' });
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  if (report.reporter_id !== req.user.id && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'You may only update your own reports.' });

  const allowed = {
    DRAFT: ['ACTIVE', 'REMOVED'], ACTIVE: ['MATCHED', 'EXPIRED', 'REMOVED'],
    MATCHED: ['ACTIVE', 'CLAIMED', 'REMOVED'], CLAIMED: ['RESOLVED', 'ACTIVE', 'REMOVED'],
    EXPIRED: ['ACTIVE', 'REMOVED'], RESOLVED: [], REMOVED: []
  };
  if (!allowed[report.status].includes(parsed.data.status)) return res.status(409).json({ error: `Cannot change status from ${report.status} to ${parsed.data.status}.` });

  const timestamp = now();
  transaction(() => {
    db.prepare('UPDATE reports SET status = ?, updated_at = ? WHERE id = ?').run(parsed.data.status, timestamp, report.id);
    db.prepare('INSERT INTO status_history (report_id, previous_status, new_status, changed_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(report.id, report.status, parsed.data.status, req.user.id, timestamp);
    audit(req.user.id, 'STATUS_CHANGED', 'REPORT', report.id, { from: report.status, to: parsed.data.status });
  });
  res.json({ id: report.id, status: parsed.data.status });
});

app.post('/api/v1/reports/:id/claims', requireAuth, (req, res) => {
  const parsed = z.object({ message: z.string().trim().min(10).max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide a claim message of at least 10 characters.' });
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!report || report.report_type !== 'FOUND' || ['REMOVED', 'RESOLVED', 'EXPIRED'].includes(report.status)) {
    return res.status(404).json({ error: 'This report is not available for claims.' });
  }
  if (report.reporter_id === req.user.id) return res.status(403).json({ error: 'You cannot claim your own report.' });
  const claimId = crypto.randomUUID();
  transaction(() => {
    db.prepare('INSERT INTO claims (id, report_id, claimant_id, message, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(claimId, report.id, req.user.id, parsed.data.message, now());
    db.prepare('UPDATE reports SET status = ?, updated_at = ? WHERE id = ?').run('CLAIMED', now(), report.id);
    createNotification(report.reporter_id, report.id, 'A user submitted a claim for your found-item report. An administrator will review it.');
    audit(req.user.id, 'CLAIM_SUBMITTED', 'CLAIM', claimId, { reportId: report.id });
  });
  res.status(201).json({ id: claimId, status: 'PENDING' });
});

app.get('/api/v1/notifications', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, report_id, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
  res.json({ results: rows.map((row) => ({ ...row, isRead: Boolean(row.is_read), createdAt: row.created_at })) });
});

app.patch('/api/v1/notifications/:id/read', requireAuth, (req, res) => {
  const result = db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: 'Notification not found.' });
  res.json({ id: req.params.id, isRead: true });
});

app.get('/api/v1/reports/mine', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, u.full_name AS reporter_name,
      (SELECT GROUP_CONCAT(tag, ',') FROM tags WHERE report_id = r.id) AS tags
    FROM reports r JOIN users u ON u.id = r.reporter_id
    WHERE r.reporter_id = ? ORDER BY r.created_at DESC
  `).all(req.user.id);
  res.json({ results: rows.map(publicReport) });
});

app.get('/api/v1/reports/:id', (req, res) => {
  const row = db.prepare(`
    SELECT r.*, u.full_name AS reporter_name,
      (SELECT GROUP_CONCAT(tag, ',') FROM tags WHERE report_id = r.id) AS tags
    FROM reports r JOIN users u ON u.id = r.reporter_id WHERE r.id = ?
  `).get(req.params.id);
  if (!row || row.status === 'REMOVED') return res.status(404).json({ error: 'Report not found.' });
  const history = db.prepare(`
    SELECT previous_status, new_status, created_at
    FROM status_history WHERE report_id = ? ORDER BY created_at ASC
  `).all(req.params.id);
  res.json({ report: publicReport(row), history });
});

app.get('/api/v1/admin/statistics', requireAuth, requireAdmin, (_req, res) => {
  const reportCounts = db.prepare('SELECT status, COUNT(*) AS count FROM reports GROUP BY status').all();
  const categoryCounts = db.prepare('SELECT category, COUNT(*) AS count FROM reports GROUP BY category ORDER BY count DESC LIMIT 20').all();
  const totals = db.prepare(`
    SELECT COUNT(*) AS reports,
      SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) AS resolved,
      SUM(CASE WHEN report_type = 'LOST' THEN 1 ELSE 0 END) AS lost,
      SUM(CASE WHEN report_type = 'FOUND' THEN 1 ELSE 0 END) AS found
    FROM reports
  `).get();
  res.json({ totals, reportCounts, categoryCounts });
});

app.get('/api/v1/admin/reports', requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT r.*, u.full_name AS reporter_name,
      (SELECT GROUP_CONCAT(tag, ',') FROM tags WHERE report_id = r.id) AS tags
    FROM reports r JOIN users u ON u.id = r.reporter_id
    ORDER BY r.created_at DESC LIMIT 200
  `).all();
  res.json({ results: rows.map(publicReport) });
});

app.get('/api/v1/admin/claims', requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT c.*, r.title AS report_title, u.full_name AS claimant_name, u.college_email AS claimant_email
    FROM claims c JOIN reports r ON r.id = c.report_id JOIN users u ON u.id = c.claimant_id
    ORDER BY c.created_at DESC LIMIT 100
  `).all();
  res.json({ results: rows });
});

app.get('/api/v1/admin/users', requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT id, college_email, full_name, role, is_active, created_at
    FROM users ORDER BY created_at DESC LIMIT 200
  `).all();
  res.json({ results: rows.map((row) => ({ ...row, isActive: Boolean(row.is_active) })) });
});

app.patch('/api/v1/admin/users/:id/active', requireAuth, requireAdmin, (req, res) => {
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'isActive must be boolean.' });
  if (req.params.id === req.user.id && !parsed.data.isActive) return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  const result = db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(parsed.data.isActive ? 1 : 0, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'User not found.' });
  audit(req.user.id, parsed.data.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'USER', req.params.id);
  res.json({ id: req.params.id, isActive: parsed.data.isActive });
});

app.patch('/api/v1/admin/claims/:id', requireAuth, requireAdmin, (req, res) => {
  const parsed = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Claim status must be APPROVED or REJECTED.' });
  const claim = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
  if (!claim || claim.verification_status !== 'PENDING') return res.status(404).json({ error: 'Pending claim not found.' });
  const timestamp = now();
  transaction(() => {
    db.prepare('UPDATE claims SET verification_status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?')
      .run(parsed.data.status, req.user.id, timestamp, claim.id);
    const nextReportStatus = parsed.data.status === 'APPROVED' ? 'RESOLVED' : 'ACTIVE';
    db.prepare('UPDATE reports SET status = ?, updated_at = ? WHERE id = ?').run(nextReportStatus, timestamp, claim.report_id);
    const claimant = db.prepare('SELECT claimant_id FROM claims WHERE id = ?').get(claim.id);
    createNotification(claimant.claimant_id, claim.report_id, `Your claim was ${parsed.data.status.toLowerCase()}.`);
    audit(req.user.id, 'CLAIM_REVIEWED', 'CLAIM', claim.id, { status: parsed.data.status });
  });
  res.json({ id: claim.id, status: parsed.data.status });
});

app.patch('/api/v1/admin/reports/:id/remove', requireAuth, requireAdmin, (req, res) => {
  const report = db.prepare('SELECT id, status FROM reports WHERE id = ?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  transaction(() => {
    db.prepare('UPDATE reports SET status = ?, updated_at = ? WHERE id = ?').run('REMOVED', now(), report.id);
    audit(req.user.id, 'REPORT_REMOVED', 'REPORT', report.id);
  });
  res.json({ id: report.id, status: 'REMOVED' });
});

app.use('/uploads', express.static(uploadDir));
app.use((error, req, res, _next) => {
  if (error instanceof multer.MulterError || error.message?.includes('image')) {
    return res.status(400).json({ error: error.message, requestId: req.requestId });
  }
  console.error(JSON.stringify({ event: 'unhandled_request_error', requestId: req.requestId, error: error.message }));
  res.status(500).json({ error: 'Unexpected server error.', requestId: req.requestId });
});

app.get('*', (_req, res) => res.sendFile(path.resolve('public/index.html')));

if (require.main === module) app.listen(port, () => console.log(`Campus Lost & Found running at http://localhost:${port}`));

module.exports = app;
