import { Stats } from "../types";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";

interface StatsPanelProps {
  stats?: Stats;
}

export default function StatsPanel({ stats }: StatsPanelProps) {
  if (!stats) {
    return (
      <div className="text-center py-8 text-ink-500">
        <p className="text-sm">Loading statistics...</p>
      </div>
    );
  }

  // Prepare data for charts
  const yearData = Object.entries(stats.by_year)
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => parseInt(a.year) - parseInt(b.year));

  const monthData = Object.entries(stats.by_month || {})
    .map(([month, count]) => ({ month, count }))
    .sort()
    .slice(-12); // Last 12 months

  const policeStationData = Object.entries(stats.by_police_station || {})
    .map(([station, count]) => ({ station, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10 stations

  const severityData = [
    { name: "Severe", value: stats.by_severity.severe, fill: "#dc2626" },
    { name: "Moderate", value: stats.by_severity.moderate, fill: "#f59e0b" },
    { name: "Low", value: stats.by_severity.low, fill: "#22c55e" },
  ];

  const districtData = Object.entries(stats.by_district).map(([name, count]) => ({ name, count }));

  const headData = Object.entries(stats.by_head || {})
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6 pb-4">
      {/* Monthly Trends */}
      <div>
        <h3 className="font-semibold text-ink-900 text-sm mb-2 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent-blue" />
          Monthly Crime Trends
        </h3>
        {monthData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={monthData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#94a3b8" style={{ fontSize: "11px" }} />
              <YAxis stroke="#94a3b8" style={{ fontSize: "11px" }} />
              <Tooltip
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
              />
              <Line type="monotone" dataKey="count" stroke="#1e40af" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-ink-500">No monthly data available</p>
        )}
      </div>

      {/* Police Station Ranking */}
      <div>
        <h3 className="font-semibold text-ink-900 text-sm mb-2">Top Police Stations</h3>
        {policeStationData.length > 0 ? (
          <div className="space-y-2">
            {policeStationData.map((station) => (
              <div key={station.station} className="flex justify-between items-center">
                <span className="text-xs text-ink-600 truncate">{station.station}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-ink-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-orange"
                      style={{
                        width: `${(station.count / Math.max(...policeStationData.map((d) => d.count))) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-ink-900 w-6 text-right">{station.count}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-500">No station data</p>
        )}
      </div>

      {/* Crime Type Distribution */}
      <div>
        <h3 className="font-semibold text-ink-900 text-sm mb-2">Crime Types Distribution</h3>
        {headData.length > 0 ? (
          <div className="space-y-1">
            {headData.map((head) => (
              <div key={head.name} className="text-xs flex justify-between">
                <span className="text-ink-600 capitalize truncate">{head.name.replace(/_/g, " ")}</span>
                <span className="font-semibold text-ink-900">{head.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-500">No crime type data</p>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-ink-900 text-sm mb-2 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent-blue" />
          Crime Trends (Year-wise)
        </h3>
        {yearData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={yearData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="year" stroke="#94a3b8" style={{ fontSize: "11px" }} />
              <YAxis stroke="#94a3b8" style={{ fontSize: "11px" }} />
              <Tooltip
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
              />
              <Bar dataKey="count" fill="#1e40af" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-ink-500">No data available</p>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-ink-900 text-sm mb-2">Crime Severity Distribution</h3>
        {severityData.some((d) => d.value > 0) ? (
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={severityData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" startAngle={90} endAngle={450}>
                {severityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-ink-500">No data available</p>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-ink-900 text-sm mb-2">Crime by District</h3>
        {districtData.length > 0 ? (
          <div className="space-y-2">
            {districtData.map((district) => (
              <div key={district.name} className="flex justify-between items-center">
                <span className="text-xs text-ink-600 capitalize">{district.name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-ink-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-blue"
                      style={{
                        width: `${(district.count / Math.max(...districtData.map((d) => d.count))) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-ink-900 w-6 text-right">{district.count}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-500">No data available</p>
        )}
      </div>
    </div>
  );
}
