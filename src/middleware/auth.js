const jwt = require('jsonwebtoken');
const db = require('../db');

function configuredAdminEmails() {
  return new Set(String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean));
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'development-secret');
    let user = db.prepare('SELECT id, college_email, role, is_active FROM users WHERE id = ?').get(req.user.id);
    if (!user && req.user.role === 'ADMIN' && configuredAdminEmails().has(String(req.user.email || '').toLowerCase())) {
      user = db.prepare(`
        SELECT id, college_email, role, is_active
        FROM users
        WHERE college_email = ? AND role = 'ADMIN'
      `).get(String(req.user.email).toLowerCase());
    }
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Your session is no longer available. Please sign in again.' });
    }
    req.user = {
      id: user.id,
      email: user.college_email,
      role: user.role
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Administrator access required.' });
  next();
}

module.exports = { requireAuth, requireAdmin };
