import { TrendingUp, TrendingDown } from "lucide-react";
import { ReactNode } from "react";

interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  /** Positive = up (configurable if up is good or bad), negative = down */
  trend?: number;
  /** Whether an upward trend is good (green) or bad (red). Defaults to true. */
  upIsGood?: boolean;
  color?: "blue" | "red" | "amber" | "green" | "orange" | "purple";
  /** If true, uses dark surface tokens. If false, uses light card. */
  dark?: boolean;
}

const DARK_ICON_BG: Record<NonNullable<KpiCardProps["color"]>, string> = {
  blue:   "bg-blue-500/20 text-blue-400",
  red:    "bg-red-500/20 text-red-400",
  amber:  "bg-amber-500/20 text-amber-400",
  green:  "bg-green-500/20 text-green-400",
  orange: "bg-orange-500/20 text-orange-400",
  purple: "bg-purple-500/20 text-purple-400",
};

const LIGHT_STYLES: Record<NonNullable<KpiCardProps["color"]>, { bg: string; border: string; text: string; icon: string }> = {
  blue:   { bg: "bg-blue-50",   border: "border-blue-100",   text: "text-blue-700",   icon: "text-blue-500" },
  red:    { bg: "bg-red-50",    border: "border-red-100",    text: "text-red-700",    icon: "text-red-500" },
  amber:  { bg: "bg-amber-50",  border: "border-amber-100",  text: "text-amber-700",  icon: "text-amber-500" },
  green:  { bg: "bg-green-50",  border: "border-green-100",  text: "text-green-700",  icon: "text-green-500" },
  orange: { bg: "bg-orange-50", border: "border-orange-100", text: "text-orange-700", icon: "text-orange-500" },
  purple: { bg: "bg-purple-50", border: "border-purple-100", text: "text-purple-700", icon: "text-purple-500" },
};

export default function KpiCard({
  icon,
  label,
  value,
  sub,
  trend,
  upIsGood = true,
  color = "blue",
  dark = true,
}: KpiCardProps) {
  const trendUp = trend !== undefined && trend > 0;
  const trendColor =
    trend === undefined
      ? ""
      : upIsGood
      ? trendUp ? "text-green-400" : "text-red-400"
      : trendUp ? "text-red-400" : "text-green-400";

  if (dark) {
    return (
      <div className="rounded-2xl border border-border bg-surface-L1 p-4 shadow-card-dark">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${DARK_ICON_BG[color]}`}>
            {icon}
          </div>
          <span className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">
            {label}
          </span>
        </div>
        <p className="text-2xl font-bold text-text-primary leading-none">{value}</p>
        {sub && <p className="text-[11px] text-text-secondary mt-1.5 leading-snug">{sub}</p>}
        {trend !== undefined && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trendColor}`}>
            {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}% vs last period
          </div>
        )}
      </div>
    );
  }

  // Light mode variant
  const s = LIGHT_STYLES[color];
  return (
    <div className={`rounded-xl border p-3 ${s.bg} ${s.border}`}>
      <div className={`flex items-center gap-1.5 mb-1 ${s.icon}`}>
        {icon}
        <span className="text-[10px] font-semibold text-ink-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xl font-bold ${s.text}`}>{value}</p>
      {sub && <p className="text-[10px] text-ink-400 mt-0.5 leading-tight">{sub}</p>}
    </div>
  );
}
