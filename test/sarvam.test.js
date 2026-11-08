const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAiResponse } = require('../src/services/sarvamService');

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
