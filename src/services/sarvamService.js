const fs = require('node:fs/promises');

const schema = {
  item_category: 'string',
  short_description: 'string',
  detailed_description: 'string',
  colour: 'string',
  brand_or_identifying_text: 'string',
  condition: 'string',
  accessories: 'array',
  search_keywords: 'array',
  confidence: 'number'
};

function parseAiResponse(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  const candidate = parsed?.choices?.[0]?.message?.content ?? parsed;
  const normalized = typeof candidate === 'string'
    ? JSON.parse(candidate.replace(/^```json\s*/i, '').replace(/\s*```$/, ''))
    : candidate;

  for (const [field, type] of Object.entries(schema)) {
    if (normalized?.[field] === undefined || (type === 'array' ? !Array.isArray(normalized[field]) : typeof normalized[field] !== type)) {
      throw new Error(`AI response is missing a valid ${field} field.`);
    }
  }
  if (normalized.confidence < 0 || normalized.confidence > 1) {
    throw new Error('AI confidence must be between 0 and 1.');
  }

  return normalized;
}

function buildPrompt() {
  return [
    'Analyze this campus lost-and-found item image.',
    'Return only valid JSON with these fields:',
    JSON.stringify(schema),
    'Do not invent unreadable text. Redact or describe sensitive identifiers such as roll numbers, phone numbers, addresses, or ID-card details.',
    'Treat the result as an uncertain draft suggestion.'
  ].join(' ');
}

class SarvamService {
  async generateItemDescription(image) {
    if (process.env.AI_ENABLED !== 'true') return { status: 'DISABLED' };
    if (!process.env.SARVAM_API_KEY) throw new Error('SARVAM_API_KEY is not configured.');

    const imageBytes = await fs.readFile(image.path);
    const mimeType = image.mimetype === 'image/png' ? 'image/png' : 'image/jpeg';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.SARVAM_TIMEOUT_MS || 15000));
    const started = Date.now();

    try {
      const response = await fetch(process.env.SARVAM_CHAT_URL || 'https://api.sarvam.ai/v2/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'api-subscription-key': process.env.SARVAM_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.SARVAM_MODEL || 'gemma4',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: buildPrompt() },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBytes.toString('base64')}` } }
            ]
          }],
          temperature: 1,
          top_p: 0.95,
          max_tokens: 500
        })
      });
      if (!response.ok) throw new Error(`Sarvam request failed with HTTP ${response.status}.`);
      const result = parseAiResponse(await response.json());
      return {
        status: 'SUCCEEDED',
        model: process.env.SARVAM_MODEL || 'gemma4',
        latencyMs: Date.now() - started,
        ...result
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = new SarvamService();
module.exports.parseAiResponse = parseAiResponse;
module.exports.buildPrompt = buildPrompt;
