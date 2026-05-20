interface SeverityBadgeProps {
  level: "severe" | "moderate" | "low";
  className?: string;
}

const STYLES = {
  severe:   "bg-red-500/20 text-red-300 border border-red-500/30",
  moderate: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  low:      "bg-green-500/20 text-green-300 border border-green-500/30",
};

const LABELS = {
  severe: "SEVERE",
  moderate: "MODERATE",
  low: "LOW",
};

export default function SeverityBadge({ level, className = "" }: SeverityBadgeProps) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STYLES[level]} ${className}`}>
      {LABELS[level]}
    </span>
  );
}

/** Inline dot — 8px colored circle for table rows */
export function SeverityDot({ level, className = "" }: SeverityBadgeProps) {
  const DOT = {
    severe:   "bg-red-500",
    moderate: "bg-amber-500",
    low:      "bg-green-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${DOT[level]} ${className}`} />;
}

/** Light-mode badge for citizen-facing screens */
export function SeverityBadgeLight({ level, className = "" }: SeverityBadgeProps) {
  const LIGHT = {
    severe:   "bg-red-100 text-red-700 border border-red-200",
    moderate: "bg-amber-100 text-amber-700 border border-amber-200",
    low:      "bg-green-100 text-green-700 border border-green-200",
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LIGHT[level]} ${className}`}>
      {LABELS[level]}
    </span>
  );
}
