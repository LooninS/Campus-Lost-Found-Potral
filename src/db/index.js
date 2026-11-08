const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.resolve(process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/campus-lost-found' : 'data'));
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'campus-lost-found.db'));
db.exec('PRAGMA foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const reportColumns = db.prepare('PRAGMA table_info(reports)').all().map((column) => column.name);
for (const [name, type] of [
  ['brand_or_identifying_text', "TEXT NOT NULL DEFAULT ''"],
  ['condition', "TEXT NOT NULL DEFAULT ''"],
  ['accessories', "TEXT NOT NULL DEFAULT '[]'"],
  ['ai_detailed_description', 'TEXT'],
  ['ai_brand_or_identifying_text', 'TEXT'],
  ['ai_condition', 'TEXT'],
  ['ai_accessories', 'TEXT'],
  ['ai_response_metadata', 'TEXT']
]) {
  if (!reportColumns.includes(name)) db.exec(`ALTER TABLE reports ADD COLUMN ${name} ${type}`);
}

module.exports = db;
