export function parseSeatsCount(seats: string | undefined | null): number {
  if (!seats || typeof seats !== 'string') return 0;

  // Common formats: "24-25", "24,25", "24", "24 - 25"
  // Normalize separators to comma
  const normalized = seats.replace(/\s+/g, '').replace(/-/g, ',');
  const parts = normalized.split(',').filter(Boolean);
  // If range-like input (e.g., "1-4" normalized to "1,4"), we can't infer the exact count reliably.
  // But for typical pair inputs like "24-25" -> 2 seats; for single "24" -> 1.
  // If parts length === 2 and both are numbers and second > first, assume contiguous range inclusive.
  if (parts.length === 2) {
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    if (!isNaN(a) && !isNaN(b) && b >= a) {
      return Math.max(1, b - a + 1);
    }
  }

  // Otherwise count explicit entries
  const explicit = parts.reduce((acc, p) => {
    const n = parseInt(p, 10);
    return acc + (isNaN(n) ? 0 : 1);
  }, 0);

  return explicit || 0;
}
