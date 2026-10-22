/**
 * SENTINEL-X SCADA — Node and Topic Utilities
 * Pure functions for topic parsing and multi-prototype node identity matching.
 */

export function isSameNode(idA?: string | null, idB?: string | null): boolean {
  if (!idA || !idB) return false;
  const a = idA.trim().toUpperCase();
  const b = idB.trim().toUpperCase();
  if (a === b) return true;

  // Match normalized alphanumeric strings with single-digit suffix (e.g. SENTINEL-X-02, SENTINEL_X_2, SENTINELX02)
  const cleanA = a.replace(/[^A-Z0-9]/g, '').replace(/0+(\d+)$/, '$1');
  const cleanB = b.replace(/[^A-Z0-9]/g, '').replace(/0+(\d+)$/, '$1');
  if (cleanA && cleanA === cleanB) return true;

  // Match SENTINEL-X-02 and SENTINEL-X-2 (handle leading zero variations in node suffix)
  const normA = a.replace(/[-_]0+(\d+)$/, '-$1');
  const normB = b.replace(/[-_]0+(\d+)$/, '-$1');
  return normA === normB;
}

export function extractNodeFromTopic(topic?: string | null): string | null {
  if (!topic) return null;
  const parts = topic.trim().split('/').filter(Boolean);
  if (parts.length === 0) return null;

  const reserved = new Set([
    '+',
    '#',
    'command',
    'event',
    'telemetry',
    'data',
    'status',
    'all',
    'broadcast',
    'daniyal',
    'sentinelx',
    'sentinel-x',
    'sentinel_x',
  ]);

  // Priority 1: Check if any topic segment explicitly matches a node identifier (e.g. SENTINEL-X-02, NODE-01, PROTOTYPE-2)
  for (const part of parts) {
    const p = part.trim();
    if (/^(?:SENTINEL[-_]?X|NODE|PROTOTYPE)[-_]?\d+$/i.test(p)) {
      return p.toUpperCase();
    }
  }

  // Priority 2: Extract candidate from sentinelx / sentinel-x topic hierarchy
  const firstPart = parts[0].toLowerCase().replace(/[-_]/g, '');
  if (firstPart === 'sentinelx') {
    for (let i = 1; i < parts.length; i++) {
      const candidate = parts[i].trim();
      if (candidate && !reserved.has(candidate.toLowerCase())) {
        return candidate.toUpperCase();
      }
    }
  }

  return null;
}
