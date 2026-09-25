// TrendChart.tsx 请求统计的时间趋势图。
//
// 为什么自己画 SVG 而不引图表库：只为一个折线/柱状图引 recharts/echarts
// 会让产物增大数百 KB，而这个图的需求很固定（单指标 + 时间轴）。
import { useState } from 'react'
import type { RangePoint } from '../types'

/** 可选指标。 */
export type TrendMetric =
  | 'requests'
  | 'completion_tokens'
  | 'prompt_tokens'
  | 'avg_ttfb_ms'
  | 'tokens_per_sec'
  | 'cache_hit_rate'
  | 'credit'

export const METRIC_LABELS: Record<TrendMetric, string> = {
  requests: '请求数',
  completion_tokens: '输出 token',
  prompt_tokens: '输入 token',
  avg_ttfb_ms: '首字延迟',
  tokens_per_sec: '吞吐',
  cache_hit_rate: '缓存命中率',
  credit: '计费（积分）',
}

/** 计数型指标用柱状，比率/延迟型用折线（趋势更易读）。 */
const LINE_METRICS: TrendMetric[] = ['avg_ttfb_ms', 'tokens_per_sec', 'cache_hit_rate']

/** 从数据点取指标值。 */
function valueOf(p: RangePoint, m: TrendMetric): number {
  const d = p.derived
  switch (m) {
    case 'avg_ttfb_ms':
      return d?.avg_ttfb_ms ?? 0
    case 'tokens_per_sec':
      return d?.tokens_per_sec ?? 0
    case 'cache_hit_rate':
      return (d?.cache_hit_rate ?? 0) * 100
    case 'credit':
      // credit 是**派生量**：网关把累计的 credit_milli/1000 算好后放在 derived 里，
      // 原始累加结构（stats）里只有 credit_milli，没有 credit。之前从 stats 取，
      // 恒为 undefined，这条「计费（积分）」趋势线永远是 0。
      return d?.credit ?? 0
    default:
      // 计数类指标（requests / *_tokens）才取原始累计值。
      return p.stats?.[m] ?? 0
  }
}

/** 数值格式化（按指标切换单位/精度）。 */
function fmtVal(v: number, m: TrendMetric): string {
  if (m === 'cache_hit_rate') return `${v.toFixed(1)}%`
  if (m === 'avg_ttfb_ms') return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`
  if (m === 'tokens_per_sec') return v.toFixed(1)
  if (m === 'credit') return v.toFixed(2)
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(Math.round(v))
}

/** 把上界取整到 1/2/5×10^k，让 y 轴刻度好读。 */
function niceMax(v: number): number {
  if (v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const n = v / base
  const mult = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return mult * base
}

/** 时间轴标签：按粒度格式化。 */
function fmtAxis(t: string, interval: string): string {
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  if (interval === 'hour') return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}h`
  if (interval === 'week') return `${p(d.getMonth() + 1)}/${p(d.getDate())}周`
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}`
}

export default function TrendChart({
  points,
  interval,
  metric,
  onMetricChange,
  height = 240,
}: {
  points: RangePoint[]
  interval: string
  metric: TrendMetric
  onMetricChange: (m: TrendMetric) => void
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  const W = 820
  const H = height
  const PAD = { l: 58, r: 14, t: 14, b: 32 }
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b

  const values = points.map((p) => valueOf(p, metric))
  const maxV = niceMax(Math.max(...values, 0))
  const isLine = LINE_METRICS.includes(metric)
  const n = points.length

  // x 坐标：n=1 时居中，否则均分。
  const xAt = (i: number) => (n <= 1 ? PAD.l + plotW / 2 : PAD.l + (plotW * i) / (n - 1))
  // 柱状图的柱宽：留 30% 间隙；点很多时收窄到 1px 之上。
  const barW = n > 0 ? Math.max(1, (plotW / n) * 0.68) : 1
  const barXAt = (i: number) => PAD.l + (plotW * (i + 0.5)) / n - barW / 2

  const yAt = (v: number) => PAD.t + plotH - (maxV > 0 ? (v / maxV) * plotH : 0)

  // x 轴标签抽稀：最多 7 个，避免密集重叠。
  const labelStep = Math.max(1, Math.ceil(n / 7))

  const linePath = points
    .map((_, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(values[i]).toFixed(1)}`)
    .join(' ')
  const areaPath =
    n > 0
      ? `${linePath} L${xAt(n - 1).toFixed(1)},${(PAD.t + plotH).toFixed(1)} L${xAt(0).toFixed(1)},${(PAD.t + plotH).toFixed(1)} Z`
      : ''

  const hovered = hover !== null ? points[hover] : null

  return (
    <div>
      <div className="page-actions" style={{ marginBottom: 10 }}>
        <span className="hint">趋势指标</span>
        <select value={metric} onChange={(e) => onMetricChange(e.target.value as TrendMetric)} style={{ width: 150 }}>
          {(Object.keys(METRIC_LABELS) as TrendMetric[]).map((k) => (
            <option key={k} value={k}>
              {METRIC_LABELS[k]}
            </option>
          ))}
        </select>
        {hovered && (
          <span className="hint">
            <strong>{hovered.key}</strong> · {METRIC_LABELS[metric]} ={' '}
            <span className="text-accent">{fmtVal(valueOf(hovered, metric), metric)}</span>
            <span className="text-faint">
              {' '}
              （请求 {hovered.stats?.requests ?? 0} · 输出 {hovered.stats?.completion_tokens ?? 0}）
            </span>
          </span>
        )}
      </div>

      {n === 0 ? (
        <div className="empty">该时间段内没有数据</div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHover(null)}
        >
          {/* y 轴网格与刻度 */}
          {[0, 0.25, 0.5, 0.75, 1].map((r) => {
            const v = maxV * r
            const y = yAt(v)
            return (
              <g key={r}>
                <line x1={PAD.l} y1={y} x2={PAD.l + plotW} y2={y} stroke="var(--border-soft)" strokeWidth="1" />
                <text x={PAD.l - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-faint)">
                  {fmtVal(v, metric)}
                </text>
              </g>
            )
          })}

          {/* 数据 */}
          {isLine ? (
            <>
              <path d={areaPath} fill="rgba(79,140,255,0.14)" stroke="none" />
              <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
              {n <= 60 &&
                points.map((pt, i) => (
                  <circle key={i} cx={xAt(i)} cy={yAt(values[i])} r="2.5" fill="var(--accent)">
                    <title>{`${pt.key}: ${fmtVal(values[i], metric)}`}</title>
                  </circle>
                ))}
            </>
          ) : (
            points.map((p, i) => {
              const v = values[i]
              const h = maxV > 0 ? (v / maxV) * plotH : 0
              return (
                <rect
                  key={i}
                  x={barXAt(i)}
                  y={PAD.t + plotH - h}
                  width={barW}
                  height={Math.max(h, v > 0 ? 1 : 0)}
                  fill={hover === i ? 'var(--accent-hover)' : 'var(--accent)'}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                >
                  <title>{`${p.key}: ${fmtVal(v, metric)}`}</title>
                </rect>
              )
            })
          )}

          {/* 悬停热区（整列，便于命中细柱） */}
          {points.map((_, i) => {
            const w = n > 0 ? plotW / n : plotW
            return (
              <rect
                key={`h${i}`}
                x={PAD.l + w * i}
                y={PAD.t}
                width={w}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            )
          })}

          {/* x 轴标签（抽稀） */}
          {points.map((p, i) =>
            i % labelStep === 0 || i === n - 1 ? (
              <text
                key={`x${i}`}
                x={xAt(i)}
                y={PAD.t + plotH + 16}
                textAnchor="middle"
                fontSize="10"
                fill="var(--text-faint)"
              >
                {fmtAxis(p.start, interval)}
              </text>
            ) : null,
          )}

          {/* 轴基线 */}
          <line
            x1={PAD.l}
            y1={PAD.t + plotH}
            x2={PAD.l + plotW}
            y2={PAD.t + plotH}
            stroke="var(--border)"
            strokeWidth="1"
          />
        </svg>
      )}
    </div>
  )
}
