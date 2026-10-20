export function openaiEndpoint(value) {
  if (value === undefined) return undefined;
  let endpoint;
  try { endpoint = typeof value === 'string' && value.trim() === value ? new URL(value) : null; } catch {}
  if (!endpoint || !['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('OpenAI endpoint must be an absolute HTTP(S) URL without credentials, query or fragment.');
  }
  return endpoint.href;
}
