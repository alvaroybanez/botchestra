import { cn } from "@/lib/utils";

const baseClasses = "font-label rounded-full px-2.5 py-0.5 text-[10px]";
const fallbackClasses = "bg-slate-200 text-slate-700";

interface StatusBadgeProps {
  className?: string;
}

// --- StudyStatusBadge ---

const studyStatusStyles: Record<string, string> = {
  draft: "bg-slate-200 text-slate-700",
  persona_review: "bg-violet-100 text-violet-800",
  ready: "bg-sky-100 text-sky-800",
  queued: "bg-amber-100 text-amber-800",
  running: "bg-blue-100 text-blue-800",
  replaying: "bg-indigo-100 text-indigo-800",
  analyzing: "bg-fuchsia-100 text-fuchsia-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
  cancelled: "bg-zinc-200 text-zinc-700",
};

interface StudyStatusBadgeProps extends StatusBadgeProps {
  status: string;
}

export function StudyStatusBadge({ status, className }: StudyStatusBadgeProps) {
  return (
    <span
      className={cn(
        baseClasses,
        studyStatusStyles[status] ?? fallbackClasses,
        className,
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

// --- RunStatusBadge ---

const runStatusStyles: Record<string, string> = {
  queued: "bg-amber-100 text-amber-800",
  dispatching: "bg-orange-100 text-orange-800",
  running: "bg-blue-100 text-blue-800",
  success: "bg-emerald-100 text-emerald-800",
  hard_fail: "bg-rose-100 text-rose-800",
  soft_fail: "bg-pink-100 text-pink-800",
  gave_up: "bg-violet-100 text-violet-800",
  timeout: "bg-yellow-100 text-yellow-800",
  blocked_by_guardrail: "bg-red-100 text-red-800",
  infra_error: "bg-slate-300 text-slate-800",
  cancelled: "bg-zinc-200 text-zinc-700",
};

interface RunStatusBadgeProps extends StatusBadgeProps {
  status: string;
}

export function RunStatusBadge({ status, className }: RunStatusBadgeProps) {
  return (
    <span
      className={cn(
        baseClasses,
        runStatusStyles[status] ?? fallbackClasses,
        className,
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

// --- SeverityBadge ---

const severityStyles: Record<string, string> = {
  blocker: "bg-rose-100 text-rose-800",
  major: "bg-amber-100 text-amber-800",
  minor: "bg-sky-100 text-sky-800",
  cosmetic: "bg-slate-200 text-slate-700",
};

interface SeverityBadgeProps extends StatusBadgeProps {
  severity: "blocker" | "major" | "minor" | "cosmetic";
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <span
      className={cn(
        baseClasses,
        severityStyles[severity] ?? fallbackClasses,
        className,
      )}
    >
      {severity}
    </span>
  );
}

// --- ConfigStatusBadge ---

const configStatusStyles: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  published: "bg-emerald-100 text-emerald-800",
  archived: "bg-slate-200 text-slate-700",
};

interface ConfigStatusBadgeProps extends StatusBadgeProps {
  status: "draft" | "published" | "archived";
}

export function ConfigStatusBadge({
  status,
  className,
}: ConfigStatusBadgeProps) {
  return (
    <span
      className={cn(
        baseClasses,
        configStatusStyles[status] ?? fallbackClasses,
        className,
      )}
    >
      {status}
    </span>
  );
}
