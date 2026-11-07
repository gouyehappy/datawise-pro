package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

var (
	reOptPage   = regexp.MustCompile(`(?i)(?:page|ye)\D*?(\d+)\s*[\/]\s*(\d+)`)
	reIPv4Loose = regexp.MustCompile(`^\d{1,3}(\.\d{1,3}){3}$`)
	reDigits    = regexp.MustCompile(`\d+`)
)

func isJumpServerBastion(spec TargetSpec) bool {
	k := strings.ToLower(strings.TrimSpace(spec.BastionKind))
	return k == "jumpserver" || k == "js" || k == "koko"
}

func (c *sshCollector) DiscoverJumpServer() ([]DiscoverItem, error) {
	var httpErr error
	if items, err := discoverJumpServerHTTP(c.spec); err == nil && len(items) > 0 {
		return items, nil
	} else if err != nil {
		httpErr = err
	}
	items, optErr := c.discoverJumpServerOpt()
	if optErr == nil && len(items) > 0 {
		return items, nil
	}
	if httpErr != nil && optErr != nil {
		return nil, fmt.Errorf("jumpserver discover failed (HTTP: %v; Opt>: %v)", httpErr, optErr)
	}
	if optErr != nil {
		return nil, optErr
	}
	if httpErr != nil {
		return nil, httpErr
	}
	return nil, fmt.Errorf("jumpserver returned no assets")
}

func discoverJumpServerHTTP(spec TargetSpec) ([]DiscoverItem, error) {
	host := strings.TrimSpace(spec.Host)
	if host == "" {
		return nil, fmt.Errorf("bastion host required")
	}
	user := strings.TrimSpace(spec.User)
	pass := spec.Password
	if user == "" || pass == "" {
		return nil, fmt.Errorf("JumpServer HTTP needs bastion user + password")
	}
	webPort := spec.WebPort
	if webPort <= 0 {
		webPort = 801
	}
	client := &http.Client{Timeout: 18 * time.Second}
	authBody, _ := json.Marshal(map[string]string{"username": user, "password": pass})
	authURL := fmt.Sprintf("http://%s/api/v1/authentication/auth/", net.JoinHostPort(host, strconv.Itoa(webPort)))
	req, err := http.NewRequest(http.MethodPost, authURL, strings.NewReader(string(authBody)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("auth dial: %w", err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("auth HTTP %d: %s", res.StatusCode, truncate(string(raw), 200))
	}
	var auth map[string]any
	if err := json.Unmarshal(raw, &auth); err != nil {
		return nil, fmt.Errorf("auth JSON: %w", err)
	}
	token := jsString(auth, "token")
	if token == "" {
		if data, ok := auth["data"].(map[string]any); ok {
			token = jsString(data, "token")
		}
	}
	if token == "" {
		return nil, fmt.Errorf("auth response missing token")
	}
	userID := ""
	if u, ok := auth["user"].(map[string]any); ok {
		userID = jsString(u, "id")
	}

	paths := []string{"/api/v1/perms/users/assets/"}
	if userID != "" {
		paths = append(paths, fmt.Sprintf("/api/v1/perms/users/%s/assets/", userID))
	}
	var lastErr error
	for _, path := range paths {
		items, err := fetchJumpServerAssetPages(client, host, webPort, token, path)
		if err != nil {
			lastErr = err
			continue
		}
		if len(items) > 0 {
			return items, nil
		}
		lastErr = fmt.Errorf("%s returned 0 assets", path)
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("no assets from HTTP API")
}

func fetchJumpServerAssetPages(client *http.Client, host string, port int, token, basePath string) ([]DiscoverItem, error) {
	var out []DiscoverItem
	seen := map[string]bool{}
	offset := 0
	limit := 100
	for page := 0; page < 50; page++ {
		u := fmt.Sprintf("http://%s%s?limit=%d&offset=%d",
			net.JoinHostPort(host, strconv.Itoa(port)), basePath, limit, offset)
		req, err := http.NewRequest(http.MethodGet, u, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		res, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))
		res.Body.Close()
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			return nil, fmt.Errorf("assets HTTP %d: %s", res.StatusCode, truncate(string(raw), 200))
		}
		var parsed any
		if err := json.Unmarshal(raw, &parsed); err != nil {
			return nil, fmt.Errorf("assets JSON: %w", err)
		}
		rows := jsAssetRows(parsed)
		if len(rows) == 0 {
			break
		}
		for _, row := range rows {
			it, ok := normalizeJumpServerHTTPAsset(row)
			if !ok {
				continue
			}
			key := strings.ToLower(it.Host + "|" + it.Name + "|" + it.AssetID)
			if seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, it)
		}
		offset += len(rows)
		if len(rows) < limit {
			break
		}
	}
	return out, nil
}

func normalizeJumpServerHTTPAsset(row map[string]any) (DiscoverItem, bool) {
	name := jsString(row, "name", "hostname")
	addr := jsString(row, "address", "ip")
	if addr == "" {
		addr = name
	}
	if addr == "" {
		return DiscoverItem{}, false
	}
	id := jsString(row, "id")
	comment := jsString(row, "comment", "remark")
	user := ""
	if accounts, ok := row["accounts"].([]any); ok && len(accounts) > 0 {
		if a, ok := accounts[0].(map[string]any); ok {
			user = jsString(a, "username", "name")
		}
	}
	if user == "" {
		user = jsString(row, "username")
	}
	return DiscoverItem{
		Host:    addr,
		Port:    22,
		Name:    firstNonEmpty(name, addr),
		User:    user,
		Source:  "jumpserver-http",
		AssetID: id,
		Comment: comment,
	}, true
}

func (c *sshCollector) discoverJumpServerOpt() ([]DiscoverItem, error) {
	c.mu.Lock()
	client := c.client
	c.mu.Unlock()
	if client == nil {
		return nil, fmt.Errorf("ssh not connected")
	}
	session, err := client.NewSession()
	if err != nil {
		return nil, err
	}
	defer session.Close()

	modes := ssh.TerminalModes{
		ssh.ECHO:          0,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm", 60, 220, modes); err != nil {
		return nil, fmt.Errorf("pty: %w", err)
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stdin, err := session.StdinPipe()
	if err != nil {
		return nil, err
	}
	if err := session.Shell(); err != nil {
		return nil, fmt.Errorf("shell: %w", err)
	}

	buf := &strings.Builder{}
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		_ = readSSHAvailable(stdout, buf, 1500*time.Millisecond)
		if strings.Contains(buf.String(), "Opt>") {
			break
		}
	}
	if !strings.Contains(buf.String(), "Opt>") {
		return nil, fmt.Errorf("JumpServer Opt> menu not detected (is this KoKo on port 2222?)")
	}

	if _, err := io.WriteString(stdin, "p\r"); err != nil {
		return nil, err
	}
	_ = readSSHAvailable(stdout, buf, 4*time.Second)

	for i := 0; i < 12; i++ {
		page, total := parseOptPage(buf.String())
		if total <= 1 || page == 0 || page >= total {
			break
		}
		if _, err := io.WriteString(stdin, "n\r"); err != nil {
			break
		}
		_ = readSSHAvailable(stdout, buf, 3*time.Second)
	}
	_ = stdin.Close()

	items := parseOptAssetTable(buf.String())
	if len(items) == 0 {
		return nil, fmt.Errorf("no assets parsed from Opt> p listing")
	}
	return items, nil
}

func readSSHAvailable(r io.Reader, buf *strings.Builder, idle time.Duration) error {
	tmp := make([]byte, 8192)
	deadline := time.Now().Add(idle)
	for time.Now().Before(deadline) {
		type result struct {
			n   int
			err error
		}
		ch := make(chan result, 1)
		go func() {
			n, err := r.Read(tmp)
			ch <- result{n, err}
		}()
		remain := time.Until(deadline)
		if remain <= 0 {
			remain = 50 * time.Millisecond
		}
		select {
		case res := <-ch:
			if res.n > 0 {
				buf.WriteString(stripANSI(string(tmp[:res.n])))
				deadline = time.Now().Add(idle)
			}
			if res.err != nil {
				return res.err
			}
		case <-time.After(remain):
			return nil
		}
	}
	return nil
}

func stripANSI(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '\x1b' {
			if i+1 < len(s) && s[i+1] == '[' {
				i += 2
				for i < len(s) && (s[i] < 'A' || s[i] > 'Z') && (s[i] < 'a' || s[i] > 'z') {
					i++
				}
				continue
			}
			continue
		}
		if s[i] == '\r' {
			continue
		}
		b.WriteByte(s[i])
	}
	return b.String()
}

func parseOptPage(text string) (page, total int) {
	lines := strings.Split(text, "\n")
	for i := len(lines) - 1; i >= 0 && i >= len(lines)-40; i-- {
		line := lines[i]
		m := reOptPage.FindStringSubmatch(line)
		if len(m) >= 3 {
			page, _ = strconv.Atoi(m[1])
			total, _ = strconv.Atoi(m[2])
			if total > 0 {
				return page, total
			}
		}
		lower := strings.ToLower(line)
		// Chinese JumpServer footer: "page: 1 ... total pages: 2, total: 80"
		if strings.Contains(lower, "page") || strings.Contains(line, "/") || strings.Contains(line, "ID") {
			nums := reDigits.FindAllString(line, -1)
			if len(nums) >= 2 && (strings.Contains(lower, "page") || strings.Contains(line, "\u603b") || strings.Contains(line, "\u9875")) {
				page, _ = strconv.Atoi(nums[0])
				total, _ = strconv.Atoi(nums[len(nums)-1])
				if total > 0 && total <= 500 && page > 0 && page <= total {
					return page, total
				}
			}
		}
	}
	return 0, 0
}

func parseOptAssetTable(text string) []DiscoverItem {
	var out []DiscoverItem
	seen := map[string]bool{}
	for _, line := range strings.Split(text, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		lower := strings.ToLower(trimmed)
		if strings.Contains(trimmed, "Opt>") ||
			strings.Contains(lower, "welcome") ||
			strings.HasPrefix(trimmed, "---") ||
			(strings.HasPrefix(lower, "id") && (strings.Contains(lower, "name") || strings.Contains(lower, "ip") || strings.Contains(lower, "address"))) {
			continue
		}
		// Skip Chinese welcome / tips lines that often contain digits in help text.
		if strings.Contains(trimmed, "\u6b22\u8fce") || strings.Contains(trimmed, "\u63d0\u793a") || strings.Contains(trimmed, "\u9875\u7801") {
			continue
		}
		fields := strings.Fields(trimmed)
		if len(fields) < 2 {
			continue
		}
		id := fields[0]
		if !isAllDigits(id) {
			continue
		}
		name := fields[1]
		addr := ""
		for _, f := range fields[2:] {
			if reIPv4Loose.MatchString(f) || looksLikeHostToken(f) {
				addr = f
				break
			}
		}
		if addr == "" {
			addr = name
		}
		if !reIPv4Loose.MatchString(addr) && !reHostToken.MatchString(addr) {
			continue
		}
		comment := ""
		idx := 2
		for i, f := range fields[2:] {
			if f == addr {
				idx = 2 + i + 1
				break
			}
		}
		if idx < len(fields) {
			comment = strings.Join(fields[idx:], " ")
		}
		key := id + ":" + addr + ":" + name
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, DiscoverItem{
			Host:    addr,
			Port:    22,
			Name:    name,
			Source:  "jumpserver-opt",
			MenuID:  id,
			Comment: comment,
		})
	}
	return out
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func looksLikeHostToken(s string) bool {
	if reIPv4Loose.MatchString(s) {
		return true
	}
	return strings.Contains(s, ".") && strings.ContainsAny(s, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")
}

func jsString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			switch t := v.(type) {
			case string:
				return t
			case float64:
				return strconv.FormatInt(int64(t), 10)
			case json.Number:
				return t.String()
			}
		}
	}
	return ""
}

func jsAssetRows(parsed any) []map[string]any {
	switch v := parsed.(type) {
	case map[string]any:
		if results, ok := v["results"].([]any); ok {
			return jsMaps(results)
		}
		if data, ok := v["data"].(map[string]any); ok {
			if results, ok := data["results"].([]any); ok {
				return jsMaps(results)
			}
		}
		if data, ok := v["data"].([]any); ok {
			return jsMaps(data)
		}
	case []any:
		return jsMaps(v)
	}
	return nil
}

func jsMaps(arr []any) []map[string]any {
	out := make([]map[string]any, 0, len(arr))
	for _, item := range arr {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
