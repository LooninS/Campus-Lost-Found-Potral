const sensitivePatterns = [
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[REDACTED_EMAIL]' },
  { pattern: /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g, replacement: '[REDACTED_PHONE]' },
  { pattern: /\b(?:roll|registration|reg|student|id)\s*(?:no|number|num|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9/-]{3,}\b/gi, replacement: '[REDACTED_ID]' },
  { pattern: /\b\d{6,}\b/g, replacement: '[REDACTED_ID]' }
];

function redactSensitiveText(value) {
  return sensitivePatterns.reduce(
    (text, { pattern, replacement }) => text.replace(pattern, replacement),
    String(value || '')
  );
}

function sanitizeAiResult(result) {
  return {
    ...result,
    short_description: redactSensitiveText(result.short_description),
    detailed_description: redactSensitiveText(result.detailed_description),
    brand_or_identifying_text: redactSensitiveText(result.brand_or_identifying_text),
    search_keywords: result.search_keywords.map(redactSensitiveText).filter((tag) => !tag.includes('[REDACTED_'))
  };
}

module.exports = { redactSensitiveText, sanitizeAiResult };
