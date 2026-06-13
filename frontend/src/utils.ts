import type { TraceSummary } from "./types";

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDuration(startedAt: number, endedAt: number | null): string {
  if (endedAt === null) return "In progress";
  const duration = Math.max(0, endedAt - startedAt);
  if (duration < 1000) return `${duration} ms`;
  if (duration < 60_000) return `${(duration / 1000).toFixed(duration < 10_000 ? 2 : 1)} s`;
  return `${(duration / 60_000).toFixed(1)} min`;
}

export function formatTime(timestamp: number | null): string {
  if (timestamp === null) return "Open";
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export function relativeTime(timestamp: number): string {
  const delta = timestamp - Date.now();
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minutes = Math.round(delta / 60_000);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

export function diagnosticCount(summary: TraceSummary): number {
  return summary.diagMissingStarts
    + summary.diagMissingEnds
    + summary.diagNegativeDurations
    + summary.diagCycles
    + summary.diagOrphanEdges
    + summary.diagInvalidImportance
    + summary.diagClockSkew
    + summary.diagLimitExceeded;
}

export function shortId(value: string, length = 12): string {
  return value.length <= length ? value : `${value.slice(0, length)}...`;
}

export function nodeLabel(nodeType: string, data: Record<string, string>, startMessage?: string | null): string {
  return startMessage || data.name || data.label || data.operation || data.title || nodeType;
}

export function formatImportance(level: number, labels?: Record<number, string>): string {
  const label = labels?.[level];
  return label ? `I${level}: ${label}` : `I${level}`;
}
