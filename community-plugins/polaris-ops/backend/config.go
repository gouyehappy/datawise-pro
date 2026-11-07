package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

type ConnConfig struct {
	Host              string
	Port              int
	Protocol          string
	ContextPath       string
	AuthMethod        string
	Username          string
	Password          string
	Token             string
	Owner             string
	ReadOnly          bool
	InsecureSkipTLS   bool
	ConnectTimeoutSec int
	BaseURL           string
	ConnectMode       string // host | url
}

func asMap(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func strVal(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			switch t := v.(type) {
			case string:
				return strings.TrimSpace(t)
			case float64:
				return strconv.FormatInt(int64(t), 10)
			case json.Number:
				return t.String()
			case bool:
				if t {
					return "true"
				}
				return "false"
			}
		}
	}
	return ""
}

func intVal(m map[string]any, def int, keys ...string) int {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			switch t := v.(type) {
			case float64:
				return int(t)
			case json.Number:
				if n, err := t.Int64(); err == nil {
					return int(n)
				}
			case string:
				if n, err := strconv.Atoi(strings.TrimSpace(t)); err == nil {
					return n
				}
			}
		}
	}
	return def
}

func boolVal(m map[string]any, def bool, keys ...string) bool {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			switch t := v.(type) {
			case bool:
				return t
			case string:
				s := strings.ToLower(strings.TrimSpace(t))
				if s == "true" || s == "1" || s == "yes" {
					return true
				}
				if s == "false" || s == "0" || s == "no" {
					return false
				}
			}
		}
	}
	return def
}

func parseConnConfig(params map[string]any) (ConnConfig, error) {
	conn := asMap(params["connection"])
	if len(conn) == 0 {
		conn = params
	}
	ext := asMap(conn["external_config"])
	if len(ext) == 0 {
		ext = asMap(conn["config"])
	}
	secrets := asMap(conn["connection_secrets"])

	cfg := ConnConfig{
		Host:              firstNonEmpty(strVal(conn, "host"), strVal(ext, "host")),
		Port:              intVal(conn, 0, "port"),
		Protocol:          strings.ToLower(firstNonEmpty(strVal(ext, "protocol"), "http")),
		ContextPath:       strVal(ext, "context_path", "contextPath"),
		AuthMethod:        strings.ToLower(firstNonEmpty(strVal(ext, "auth_method", "authMethod"), "password")),
		Username:          firstNonEmpty(strVal(conn, "user", "username"), strVal(ext, "username", "user")),
		Password:          firstNonEmpty(strVal(secrets, "password"), strVal(conn, "password"), strVal(ext, "password")),
		Token:             firstNonEmpty(strVal(secrets, "token"), strVal(ext, "token")),
		Owner:             firstNonEmpty(strVal(ext, "owner"), "polaris"),
		ReadOnly:          boolVal(ext, false, "read_only", "readOnly"),
		InsecureSkipTLS:   boolVal(ext, false, "insecure_skip_tls", "insecureSkipTls"),
		ConnectTimeoutSec: intVal(ext, 20, "connect_timeout_secs", "connectTimeoutSecs"),
		ConnectMode:       strings.ToLower(firstNonEmpty(strVal(ext, "connect_mode", "connectMode"), "host")),
	}
	if cfg.ConnectTimeoutSec <= 0 {
		cfg.ConnectTimeoutSec = 20
	}

	baseURLRaw := firstNonEmpty(strVal(ext, "base_url", "baseUrl", "url"), strVal(conn, "base_url", "baseUrl", "url"))
	if cfg.ConnectMode == "url" || (cfg.Host == "" && baseURLRaw != "") {
		if err := applyEndpointURL(&cfg, baseURLRaw); err != nil {
			return cfg, err
		}
	} else {
		// Host field may itself be a pasted URL (Kibana-style).
		if looksLikeURL(cfg.Host) {
			if err := applyEndpointURL(&cfg, cfg.Host); err != nil {
				return cfg, err
			}
		} else {
			if cfg.Port == 0 {
				cfg.Port = intVal(ext, 8090, "port")
			}
			if cfg.Port == 0 {
				if cfg.Protocol == "https" {
					cfg.Port = 443
				} else {
					cfg.Port = 8090
				}
			}
			if cfg.Host == "" {
				return cfg, fmt.Errorf("host is required")
			}
			cfg.BaseURL = fmt.Sprintf("%s://%s:%d%s", cfg.Protocol, cfg.Host, cfg.Port, normalizeContext(cfg.ContextPath))
		}
	}

	// password-as-token when username empty
	if cfg.Token == "" && cfg.Username == "" && cfg.Password != "" {
		cfg.Token = cfg.Password
		cfg.AuthMethod = "token"
	}
	return cfg, nil
}

func looksLikeURL(s string) bool {
	s = strings.TrimSpace(strings.ToLower(s))
	return strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://")
}

/** applyEndpointURL fills protocol/host/port/context/BaseURL from a console URL. */
func applyEndpointURL(cfg *ConnConfig, raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fmt.Errorf("url is required")
	}
	if !strings.Contains(raw, "://") {
		raw = "http://" + raw
	}
	// Fix typos like http://host:  (colon without port).
	if i := strings.LastIndex(raw, ":"); i > strings.Index(raw, "://")+2 {
		after := raw[i+1:]
		if after == "" || strings.HasPrefix(after, "/") {
			raw = raw[:i] + after
		}
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return fmt.Errorf("invalid url: %s", raw)
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return fmt.Errorf("unsupported url scheme: %s", scheme)
	}
	cfg.Protocol = scheme
	cfg.Host = u.Hostname()
	if cfg.Host == "" {
		return fmt.Errorf("invalid url host: %s", raw)
	}
	if p := u.Port(); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil || n <= 0 {
			return fmt.Errorf("invalid url port: %s", p)
		}
		cfg.Port = n
	} else if scheme == "https" {
		cfg.Port = 443
	} else {
		cfg.Port = 80
	}
	path := strings.TrimSpace(u.Path)
	if path != "" && path != "/" {
		cfg.ContextPath = normalizeContext(path)
	} else {
		cfg.ContextPath = ""
	}
	cfg.BaseURL = fmt.Sprintf("%s://%s:%d%s", cfg.Protocol, cfg.Host, cfg.Port, normalizeContext(cfg.ContextPath))
	cfg.ConnectMode = "url"
	return nil
}

func normalizeContext(p string) string {
	p = strings.TrimSpace(p)
	if p == "" || p == "/" {
		return ""
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return strings.TrimRight(p, "/")
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
