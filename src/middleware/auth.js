const jwt = require('jsonwebtoken');
const db = require('../db');

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'development-secret');
    const user = db.prepare('SELECT id, college_email, role, is_active FROM users WHERE id = ?').get(req.user.id);
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
