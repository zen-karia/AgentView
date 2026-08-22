import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ConditionResult, MetricKey } from "@contracts";
import { CONDITION_META, METRIC_META } from "@contracts";
import { conditionColor } from "@components/ui";
import { useTheme } from "../../../app/theme";
import { formatCompact, formatMetric } from "../lib/format";
import { winnerFor } from "../lib/aggregate";

interface ConditionChartProps {
  results: ConditionResult[];
  metric: MetricKey;
}

interface Datum {
  condition: ConditionResult["condition"];
  short: string;
  value: number;
  display: string;
  color: string;
  isWinner: boolean;
  runCount: number;
}

/** Per-metric comparison across the conditions returned by the backend. Bars carry condition
    identity colour; the winner is marked (★ + full opacity) so the "who wins"
    read and the "which condition" read are both direct — never colour-alone. */
export function ConditionChart({ results, metric }: ConditionChartProps) {
  const { theme } = useTheme();
  const meta = METRIC_META[metric];
  const winner = winnerFor(results, metric);

  const data: Datum[] = results.map((r) => {
    const value = r.metrics[metric];
    const isWinner = r.condition === winner;
    return {
      condition: r.condition,
      short: CONDITION_META[r.condition].shortLabel,
      value,
      display: `${isWinner ? "★ " : ""}${formatCompact(value, metric)}`,
      color: conditionColor(r.condition, theme),
      isWinner,
      runCount: r.runCount,
    };
  });

  const max = Math.max(...data.map((d) => d.value), 0);

  return (
    <div className="bm-chart__wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 8, bottom: 4, left: 8 }} barCategoryGap="22%">
          <XAxis
            dataKey="short"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: "var(--axis)" }}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          />
          <YAxis hide domain={[0, max * 1.18 || 1]} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip metric={metric} />} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell
                key={d.condition}
                fill={d.color}
                fillOpacity={d.isWinner ? 1 : 0.82}
                stroke={d.isWinner ? "var(--text-primary)" : "none"}
                strokeWidth={d.isWinner ? 1.25 : 0}
              />
            ))}
            <LabelList
              dataKey="display"
              position="top"
              fill="var(--text-primary)"
              fontSize={12}
              fontWeight={600}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <span className="sr-only">
        {meta.label}: {data.map((d) => `${d.short} ${formatMetric(d.value, metric)}`).join(", ")}.
      </span>
    </div>
  );
}

interface TooltipProps {
  metric: MetricKey;
  active?: boolean;
  payload?: Array<{ payload: Datum }>;
}

function ChartTooltip({ metric, active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="bm-tooltip">
      <div className="bm-tooltip__name">
        <span className="ui-dot" style={{ background: d.color }} />
        {CONDITION_META[d.condition].label}
      </div>
      <div className="bm-tooltip__val">
        {METRIC_META[metric].label}: <strong>{formatMetric(d.value, metric)}</strong>
        <br />
        across {d.runCount} runs
      </div>
    </div>
  );
}
