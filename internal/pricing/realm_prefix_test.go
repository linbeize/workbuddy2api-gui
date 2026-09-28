package pricing

import "testing"

// TestStripRealmPrefix realm 前缀剥离：`cn:` / `global:` 大小写不敏感地去掉，
// 无前缀原样返回，空串安全。
func TestStripRealmPrefix(t *testing.T) {
	cases := []struct{ in, want string }{
		{"cn:deepseek-v4-flash", "deepseek-v4-flash"},
		{"global:deepseek-v4-pro", "deepseek-v4-pro"},
		{"CN:Glm-5.3", "Glm-5.3"},
		{"Global:Kimi-K2.5", "Kimi-K2.5"},
		{"deepseek-v4-flash", "deepseek-v4-flash"},
		{"  cn:deepseek-v4-pro  ", "deepseek-v4-pro"},
		{"cn:", ""},
		{"", ""},
		// 冒号出现在中间不算前缀：不剥，避免误伤未来的命名。
		{"vendor:model", "vendor:model"},
	}
	for _, c := range cases {
		if got := stripRealmPrefix(c.in); got != c.want {
			t.Errorf("stripRealmPrefix(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// TestResolveWithRealmPrefix 带 realm 前缀的模型名必须命中价格表。
//
// 回归：统计页的模型名来自网关（带 `cn:` 前缀），而价格表只维护裸模型名。
// 早期 Resolve 只做 normalize（去 . - _），不剥前缀，于是
// "cn:deepseekv4flash" ≠ "deepseekv4flash"，全部模型被判为未定价，
// 官方应付金额恒为 0。
func TestResolveWithRealmPrefix(t *testing.T) {
	tb := Default()
	for _, m := range []string{
		"deepseek-v4-flash",
		"cn:deepseek-v4-flash",
		"cn:deepseek-v4.1-flash",
		"cn:deepseek-v4-pro",
		"global:deepseek-v4-flash",
	} {
		if _, ok := tb.Resolve(m); !ok {
			t.Errorf("Resolve(%q) 未命中，应命中内置 DeepSeek 价", m)
		}
	}
}

// TestResolveRealmPrefixDoesNotOverMatch 剥前缀不得让未定价模型误命中。
func TestResolveRealmPrefixDoesNotOverMatch(t *testing.T) {
	tb := Default()
	for _, m := range []string{"cn:hy3", "cn:glm-5.3", "cn:kimi-k3-1", "cn:nonexistent-model"} {
		if _, ok := tb.Resolve(m); ok {
			t.Errorf("Resolve(%q) 不应命中：该模型没有内置价格", m)
		}
	}
}

// TestComputeWithRealmPrefix 端到端：带前缀走 Compute 应正常计价。
//
// 命中 1M / 未命中 1M / 输出 1M（高峰价）= 0.04 + 2.00 + 8.00 = 10.04 元。
func TestComputeWithRealmPrefix(t *testing.T) {
	tb := Default()
	c := tb.Compute("cn:deepseek-v4.1-flash", Usage{
		PromptTokens:     2_000_000,
		CacheHitTokens:   1_000_000,
		CacheMissTokens:  1_000_000,
		CompletionTokens: 1_000_000,
	}, ModePeak)

	if !c.Priced {
		t.Fatal("带 cn: 前缀的模型应命中内置价")
	}
	if got, want := c.Total, 10.04; got < want-0.001 || got > want+0.001 {
		t.Errorf("Total = %.4f, want %.2f", got, want)
	}
}
