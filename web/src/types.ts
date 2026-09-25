// types.ts 与 Go 后端 JSON 结构一一对应的类型定义。

/** 账号合并视图（磁盘凭证 + 网关运行态 + 积分缓存）。 */
export interface Account {
  uid: string
  nickname: string
  enterprise_id: string
  domain: string

  has_file: boolean
  file_name: string
  expires_at: number
  expired: boolean
  needs_refresh: boolean
  has_refresh_token: boolean

  in_gateway: boolean
  /** healthy | cooling | disabled | token_expired | gateway_unreachable | missing_credential | unknown */
  status: string

  cooling: boolean
  cool_kind?: string
  cool_remaining_sec?: number
  disabled: boolean
  reason?: string
  in_flight: number
  breaker_fails: number
  breaker_until?: string
  soft_streak?: number
  success_count: number
  err_total: number
  last_success?: string
  last_err?: string

  credits: number
  live_credits?: number
  credits_at?: string
  /** 积分到期：与 live_credits 同源同时刻。 */
  credits_expire_at?: string
  credits_expiring?: number
}

/** 单个积分包的到期明细。 */
export interface CreditPack {
  name?: string
  /**
   * 真正的到期时间，上游原文 "2006-01-02 15:04:05"；空 = 无到期。
   *
   * 后端取的是上游 `DeductionEndTime`（扣费截止），不是 `CycleEndTime` ——
   * 按周期发量的包（如「个人体验版」）CycleEndTime 只是月周期边界，
   * 拿它当到期会虚报「几天后作废」。两者不同时 cycle_end_time 会一并给出。
   */
  end_time?: string
  /** 上游 CycleEndTime 原文；与 end_time 不同才需要展示。 */
  cycle_end_time?: string
  remain: number
  size: number
}

export interface Credits {
  remain: number
  used: number
  size: number
  packages: number
  /** 最近一次积分到期时间（上游原文，空 = 无到期）。 */
  expires_at?: string
  /** 与 expires_at 同时刻到期的那批剩余积分。 */
  expiring_remain?: number
  details?: CreditPack[] | null
}

export interface CreditsTotal {
  remain: number
  used: number
  size: number
  accounts: number
  ok: number
  failed: number
}

export interface Health {
  healthy: number
  total: number
  service: string
}

export interface Overview {
  gateway_url: string
  gateway_ok: boolean
  gateway_error?: string
  health?: Health

  total: number
  healthy: number
  cooling: number
  disabled: number
  in_flight_full: number
  in_flight: number
  sticky_sessions: number
  redis_mode: string

  file_count: number
  expired: number
  expiring: number
  warnings?: string[]
  file_issues?: string[]

  credits: CreditsTotal
  read_only: boolean
  dangerous_ops: boolean
  server_time: string
}

export interface GatewayStatus {
  total: number
  healthy: number
  cooling: number
  disabled: number
  in_flight_full: number
  sticky_sessions: number
  redis_mode: string
}

export interface AccountsResponse {
  accounts: Account[]
  file_issues?: string[]
  gateway_ok: boolean
  gateway_error?: string
  summary?: GatewayStatus
}

export interface OpResult {
  uid: string
  action: string
  ok: boolean
  message: string
  reward?: number
  data?: Record<string, unknown>
}

export interface TaskItem {
  uid: string
  nickname: string
  action: string
  ok: boolean
  message: string
  reward?: number
  started_at: string
  ended_at: string
}

export interface TaskView {
  id: string
  kind: string
  title: string
  running: boolean
  error?: string
  started_at: string
  finished_at?: string
  total: number
  done: number
  ok: number
  failed: number
  items?: TaskItem[]
}

export interface TaskListResponse {
  tasks: TaskView[] | null
  running: TaskView[] | null
}

export type LoginState = 'pending' | 'success' | 'error' | 'expired' | 'cancelled'

export interface LoginSession {
  id: string
  region: 'cn' | 'global'
  auth_url: string
  status: LoginState
  message?: string
  created_at: string
  updated_at: string
  uid?: string
  nickname?: string
  saved: boolean
  file?: string
  restart?: string
}

export interface Model {
  id: string
  object: string
  created: number
  owned_by: string
  context_length: number
  max_output_tokens?: number

  /** 以下为网关 /v1/models 透出的上游元信息（模型目录页用）。 */
  /** 上游显示名，如 "Deepseek-V4.1-Flash"。 */
  name?: string
  description?: string
  /** 积分倍率原文，形如 "x0.03" 或 "x0.59 credits"；缺省 = 上游未标倍率。 */
  credits?: string
  vendor?: string
  tags?: string[]
  is_default?: boolean
  only_reasoning?: boolean
  /**
   * 上游声明的图片能力。
   *
   * ⚠️ **不要拿它上屏**：2026-09-23 实测国际版 hy* 系（hy3 / hy4-preview-f / hy4-preview）
   * 全标 true 但根本认不出图（二选一 8/20 = 瞎猜水平；同账号 glm-5v-turbo 4/4、
   * 国内版同族模型各 8/8）。这个字段只说明「接口收得下图片」，不代表看得懂。
   * 要判断图片能力只能实测，故模型页不展示这一列。
   */
  supports_images?: boolean
  supports_reasoning?: boolean
  supports_tool_call?: boolean
  max_allowed_size?: number
  reasoning_effort?: string
  reasoning_summary?: string

  /** 命中的上游促销（限时免费 / 折扣）。按优先级降序，可能同时有多条。 */
  promotions?: ModelPromotion[] | null
}

/** 促销的每日时段（如夜间折扣）。 */
export interface PromoWindow {
  /** "HH:MM" */
  start: string
  /** "HH:MM"；早于 start 表示跨零点（如 23:00→08:00） */
  end: string
}

/** 上游 /v3/config 下发的模型促销条目。 */
export interface ModelPromotion {
  id: string
  /** 生效的裸模型名（无域前缀），与 Model.id 去掉 realm 前缀后对齐。 */
  model_ids: string[] | null
  enabled: boolean
  /** 促销类型原文，如 "limited_free" / "off_peak"。 */
  kind?: string
  priority?: number
  badge_label?: string
  badge_color?: string
  /** 上游是否下发了 discount 块。false = 只挂徽标的条目（factor 无意义，别当免费）。 */
  has_discount?: boolean
  /** 折扣系数：0 = 免费，0.5 = 五折，1 = 无折扣。
   *  仅在 has_discount 为真时下发 —— 没有 discount 块的条目这个字段是**缺席**的，
   *  不是 0（后端用指针 + omitempty 保证），所以别用 `factor ?? 0`。 */
  factor?: number
  discounted_credits?: string
  /** 日期区间型促销的起止（上游原文，形如 "2026-09-25 23:59:59"）。 */
  valid_from?: string
  valid_until?: string
  /** 每日时段型促销的窗口。 */
  daily?: PromoWindow[] | null
  timezone?: string
  /** 上游 hover 文案（中文）。 */
  text?: string
}

export interface ModelsResponse {
  data: Model[] | null
  count: number
  /** 按域记录促销拉取失败原因（best-effort，失败不影响模型列表）。 */
  promo_errors?: Record<string, string> | null
}

export interface SessionInfo {
  authenticated: boolean
  username: string
  read_only: boolean
  dangerous_ops: boolean
  using_default_password: boolean
  gateway_url: string
  /** 服务端是否支持网页改密码（配置了 credentials_file）。 */
  password_changeable?: boolean
}

export interface ConfigMeta {
  path: string
  exists: boolean
  size: number
  mod_time?: string
  backup_path?: string
  backup_at?: string
  parse_error?: string
  is_valid_json: boolean
  restart_note: string
}

export interface ConfigResponse {
  config: Record<string, unknown>
  meta: ConfigMeta
}

export interface ContainerInfo {
  name: string
  available: boolean
  exists: boolean
  running: boolean
  status: string
  health: string
  image: string
  started_at?: string
  error?: string
  disabled: boolean
}

export interface SystemInfo {
  version: string
  started_at: string
  uptime_sec: number
  read_only: boolean
  dangerous_ops: boolean
  auth_dir: string
  config_file: string
  gateway_url: string
  using_default_password: boolean
  docker_available: boolean
  container: ContainerInfo
  gateway_health?: Health
  gateway_health_error?: string
}

export interface ChatResult {
  content: string
  reasoning_content?: string
  model: string
  finish_reason?: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  raw?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AccountProfile {
  account: Account
  credits?: Credits
  credits_error?: string
  buddy?: { id: number; name: string } | null
  buddy_error?: string
  travel?: { state: string; daily_limit_reached: boolean; record_id: number; reward_credit: number }
  travel_error?: string
  upstream_error?: string
}

/** SSE 流式聊天的增量帧。 */
export interface ChatDelta {
  content?: string
  reasoning?: string
  done?: boolean
  error?: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  elapsed_ms?: number
  ttfb_ms?: number
}

/** 单个模型的派生统计（对应网关 /v1/stats 的 models[]）。 */
export interface ModelStat {
  model: string
  requests: number
  success: number
  failed: number
  streaming: number
  /** 平均首字延迟（毫秒） */
  avg_ttfb_ms: number
  /** 平均端到端耗时（毫秒） */
  avg_latency_ms: number
  /** 生成吞吐（输出 token / 秒） */
  tokens_per_sec: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cache_hit_tokens: number
  cache_miss_tokens: number
  cache_write_tokens: number
  /** 缓存命中率 0~1 */
  cache_hit_rate: number
  credit: number
  credit_per_req: number
  last_seen?: string
}

/**
 * 时间序列数据点里的**原始累计**统计（对应网关的 ModelStats）。
 *
 * 与 ModelStat 的区别：这里是「和与计数」，没有均值/比率——平均首字延迟、吞吐、
 * 命中率、扣费都要网关算过才在 derived 里。类型分开是刻意的：之前 stats 写成
 * ModelStat，TS 便放过了 `p.stats.credit`（运行时并不存在该字段），
 * 于是「计费（积分）」趋势线静默恒为 0。
 */
export interface RawModelStat {
  model: string
  requests: number
  success: number
  failed: number
  streaming: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  /**
   * 扣费累计，单位为「毫」（网关侧用整数累计避免浮点误差）。
   * 展示一律用 derived.credit —— 本字段只用来解释「为什么不能从 stats 取扣费」。
   * 可选是因为部分网关实现（stats 直接下发派生量）不带它，面板不读。
   */
  credit_milli?: number
  last_seen?: string
}

/** 时间序列上的一个数据点。 */
export interface RangePoint {
  key: string
  start: string
  end: string
  /** 原始累计量：计数类指标从这里取。 */
  stats: RawModelStat
  /** 派生指标：均值/比率/扣费从这里取。 */
  derived: ModelStat
}

/** 时间范围聚合结果。 */
export interface RangeResult {
  interval: 'hour' | 'day' | 'week'
  from: string
  to: string
  points: RangePoint[] | null
  total: ModelStat
  models: string[] | null
}

/** 网关 /v1/stats 响应。 */
export interface Stats {
  enabled: boolean
  message?: string
  since: string
  now: string
  uptime_sec: number
  total: ModelStat
  models: ModelStat[] | null
  /** 时间序列桶数（判断数据可回溯范围） */
  series_buckets?: number
  /** 时间维度查询结果（带时间参数时返回） */
  range?: RangeResult
}

/** 单个模型的官方单价（元/百万 token）。 */
export interface ModelPrice {
  /** 缓存命中输入单价 */
  cached_input: number
  /** 缓存未命中输入单价 */
  miss_input: number
  /** 输出单价 */
  output: number
  /** 空闲时段价倍数（如 0.5）；0/1 = 不区分时段 */
  off_peak_ratio?: number
  note?: string
}

/** 单模型的官方价换算结果。 */
export interface ModelCost {
  model: string
  priced: boolean
  note?: string
  cached_input_cost: number
  miss_input_cost: number
  output_cost: number
  total: number
  cached_input_tokens: number
  miss_input_tokens: number
  output_tokens: number
}

/** 价格表元信息。 */
export interface PricingTable {
  models: Record<string, ModelPrice> | null
  source?: string
  updated_at?: string
  /** 服务端是否可保存编辑（配置了 pricing_file） */
  editable: boolean
}

/** /api/stats 的完整响应（统计 + 官方价换算）。 */
export interface StatsResponse {
  stats: Stats
  mode: 'peak' | 'offpeak'
  costs: Record<string, ModelCost> | null
  total: ModelCost
  priced: string[] | null
  unpriced: string[] | null
  pricing: PricingTable
}
