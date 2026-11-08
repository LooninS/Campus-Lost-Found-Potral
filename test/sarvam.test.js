const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sarvamService = require('../src/services/sarvamService');
const { redactSensitiveText, sanitizeAiResult } = require('../src/services/privacy');
const { parseAiResponse } = sarvamService;

const valid = {
  item_category: 'wallet',
  short_description: 'Black leather wallet',
  detailed_description: 'Small black wallet with visible stitching.',
  colour: 'black',
  brand_or_identifying_text: 'none readable',
  condition: 'used',
  accessories: [],
  search_keywords: ['black', 'wallet', 'leather'],
  confidence: 0.84
};

test('parses a valid structured Sarvam response', () => {
  assert.deepEqual(parseAiResponse(valid), valid);
});

test('parses an OpenAI-compatible response with fenced JSON', () => {
  const wrapped = { choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(valid)}\n\`\`\`` } }] };
  assert.deepEqual(parseAiResponse(wrapped), valid);
});

test('rejects incomplete or unsafe AI responses', () => {
  assert.throws(() => parseAiResponse({ ...valid, confidence: 2 }), /confidence/);
  assert.throws(() => parseAiResponse({ ...valid, search_keywords: 'wallet' }), /search_keywords/);
});

test('redacts sensitive identifiers from AI draft text', () => {
  const sanitized = sanitizeAiResult({
    ...valid,
    detailed_description: 'Label shows roll no: AB123456 and phone 9876543210.',
    brand_or_identifying_text: 'student@example.com',
    search_keywords: ['wallet', '9876543210', 'leather']
  });
  assert.match(sanitized.detailed_description, /\[REDACTED_ID\]/);
  assert.match(sanitized.detailed_description, /\[REDACTED_PHONE\]/);
  assert.equal(sanitized.brand_or_identifying_text, '[REDACTED_EMAIL]');
  assert.deepEqual(sanitized.search_keywords, ['wallet', 'leather']);
});

test('retries transient Sarvam failures within the configured limit', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sarvam-test-'));
  const imagePath = path.join(directory, 'item.png');
  await fs.writeFile(imagePath, 'image');
  const originalFetch = global.fetch;
  const originalEnvironment = {
    AI_ENABLED: process.env.AI_ENABLED,
    SARVAM_API_KEY: process.env.SARVAM_API_KEY,
    SARVAM_MAX_RETRIES: process.env.SARVAM_MAX_RETRIES,
    SARVAM_RETRY_DELAY_MS: process.env.SARVAM_RETRY_DELAY_MS
  };
  let calls = 0;
  process.env.AI_ENABLED = 'true';
  process.env.SARVAM_API_KEY = 'test-key';
  process.env.SARVAM_MAX_RETRIES = '2';
  process.env.SARVAM_RETRY_DELAY_MS = '0';
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 503 };
    return { ok: true, json: async () => valid };
  };

  try {
    const result = await sarvamService.generateItemDescription({ path: imagePath, mimetype: 'image/png' });
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.attempts, 2);
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('marks low-confidence Sarvam drafts for manual review', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sarvam-confidence-'));
  const imagePath = path.join(directory, 'item.png');
  await fs.writeFile(imagePath, 'image');
  const originalFetch = global.fetch;
  const originalEnvironment = {
    AI_ENABLED: process.env.AI_ENABLED,
    SARVAM_API_KEY: process.env.SARVAM_API_KEY,
    SARVAM_MIN_CONFIDENCE: process.env.SARVAM_MIN_CONFIDENCE,
    SARVAM_MAX_RETRIES: process.env.SARVAM_MAX_RETRIES
  };
  process.env.AI_ENABLED = 'true';
  process.env.SARVAM_API_KEY = 'test-key';
  process.env.SARVAM_MIN_CONFIDENCE = '0.95';
  process.env.SARVAM_MAX_RETRIES = '0';
  global.fetch = async () => ({ ok: true, json: async () => valid });

  try {
    const result = await sarvamService.generateItemDescription({ path: imagePath, mimetype: 'image/png' });
    assert.equal(result.status, 'LOW_CONFIDENCE');
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});
