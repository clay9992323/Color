export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const normalized = Math.max(0, Math.floor(value))
  return Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 0,
  }).format(normalized)
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

export function formatSeconds(value: number): string {
  if (value < 60) {
    return `${Math.round(value)}s`
  }
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}
