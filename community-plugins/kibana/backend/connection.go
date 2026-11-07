package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Auth modes mirror the connection form (k8s-style auth_mode select).
const (
	AuthNone   = "none"
	AuthBasic  = "basic"
	AuthAPIKey = "api_key"
	AuthBearer = "bearer"
)

// Config is the resolved Kibana endpoint used by the HTTP client.
type Config struct {
	ID                    string
	BaseURL               string // scheme://host:port (no trailing slash)
	KibanaBasePath        string // /soc-v7-kibana or empty
	SpaceID               string // soc_space_sdp or empty
	Transport             string // auto | console_proxy | elasticsearch_proxy
	AuthMode              string // none | basic | api_key | bearer
	Username              string
	Password              string
	APIKey                string // id:key or already Base64-encoded
	BearerToken           string
	DefaultIndex          string
	InsecureSkipTLSVerify bool
	Timeout               time.Duration
}

type connectionManager struct {
	mu    sync.Mutex
	byID  map[string]*Config
	clients map[string]*Client
}

func newConnectionManager() *connectionManager {
	return &connectionManager{
		byID:    map[string]*Config{},
		clients: map[string]*Client{},
	}
}

func object(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func text(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case json.Number:
		return t.String()
	default:
		return ""
	}
}

func boolean(values ...any) bool {
	for _, value := range values {
		if b, ok := value.(bool); ok {
			return b
		}
		s := strings.ToLower(strings.TrimSpace(text(value)))
		if s == "true" || s == "1" || s == "yes" || s == "on" {
			return true
		}
	}
	return false
}

func connectionID(values map[string]any) string {
	id := text(values["connectionId"])
	if id == "" {
		id = text(object(values["connection"])["id"])
	}
	return id
}

func normalizeBasePath(value string) string {
	path := strings.Trim(strings.TrimSpace(value), "/")
	if path == "" {
		return ""
	}
	return "/" + path
}

func numberAsInt(v any, fallback int) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case json.Number:
		n, err := t.Int64()
		if err == nil {
			return int(n)
		}
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(t))
		if err == nil {
			return n
		}
	}
	return fallback
}

// Resolve hydrates connection params from the host payload (external_config / secrets).
func Resolve(values map[string]any) (*Config, error) {
	conn := object(values["connection"])
	external := object(conn["external_config"])
	if external == nil {
		external = object(conn["config"])
	}
	if external == nil {
		if encoded := text(conn["config_json"]); encoded != "" {
			if err := json.Unmarshal([]byte(encoded), &external); err != nil {
				return nil, errors.New("invalid connection config_json")
			}
		}
	}
	get := func(key string) string {
		for _, source := range []map[string]any{external, conn, values} {
			if s := text(source[key]); s != "" {
				return s
			}
		}
		return ""
	}
	secrets := object(conn["connection_secrets"])
	secret := func(key string) string {
		if s := text(secrets[key]); s != "" {
			return s
		}
		for _, source := range []map[string]any{conn, values} {
			if s := text(source[key]); s != "" {
				return s
			}
		}
		return ""
	}

	hostRaw := strings.TrimSpace(get("host"))
	if hostRaw == "" {
		return nil, errors.New("host is required")
	}
	useHTTPS := boolean(get("use_https"), get("useHttps"), external["use_https"], external["useHttps"])
	scheme := "http"
	if useHTTPS {
		scheme = "https"
	}

	// Allow pasting a full Kibana URL into Host, e.g. https://kibana.example.com/kibana
	host := hostRaw
	portFromURL := 0
	pathFromURL := ""
	lower := strings.ToLower(host)
	if strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "http://") {
		if parsed, err := url.Parse(hostRaw); err == nil && parsed.Host != "" {
			if parsed.Scheme == "https" {
				scheme = "https"
			} else if parsed.Scheme == "http" {
				scheme = "http"
			}
			host = parsed.Hostname()
			if parsed.Port() != "" {
				if n, err := strconv.Atoi(parsed.Port()); err == nil {
					portFromURL = n
				}
			}
			pathFromURL = parsed.EscapedPath()
		} else {
			if strings.HasPrefix(lower, "https://") {
				scheme = "https"
				host = hostRaw[len("https://"):]
			} else {
				scheme = "http"
				host = hostRaw[len("http://"):]
			}
			if slash := strings.IndexByte(host, '/'); slash >= 0 {
				pathFromURL = host[slash:]
				host = host[:slash]
			}
		}
	} else if slash := strings.IndexByte(host, '/'); slash >= 0 {
		pathFromURL = host[slash:]
		host = host[:slash]
	}

	defaultPort := 5601
	if scheme == "https" {
		defaultPort = 443
	}
	port := defaultPort
	portExplicit := false
	for _, source := range []map[string]any{external, conn, values} {
		if source == nil {
			continue
		}
		if v, ok := source["port"]; ok && text(v) != "" {
			port = numberAsInt(v, port)
			portExplicit = true
			break
		}
	}
	if colon := strings.LastIndex(host, ":"); colon > 0 && !strings.Contains(host, "]") {
		maybePort := host[colon+1:]
		if n, err := strconv.Atoi(maybePort); err == nil && n > 0 {
			port = n
			portExplicit = true
			host = host[:colon]
		}
	}
	if portFromURL > 0 {
		port = portFromURL
		portExplicit = true
	} else if strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "http://") {
		// Full URL without :port → use scheme default (443/80), not the form's Kibana 5601.
		if scheme == "https" {
			port = 443
		} else {
			port = 80
		}
		portExplicit = true
	}
	// If user only toggled HTTPS and left the old 5601 default, prefer 443.
	if scheme == "https" && !portExplicit && port == 5601 {
		port = 443
	}
	if host == "" {
		return nil, errors.New("host is required")
	}

	basePath := normalizeBasePath(get("kibana_base_path"))
	if basePath == "" {
		basePath = normalizeBasePath(get("kibanaBasePath"))
	}
	if basePath == "" {
		basePath = normalizeBasePath(pathFromURL)
	}
	timeoutS := numberAsInt(nil, 30)
	for _, key := range []string{"timeout_s", "timeoutS"} {
		if v := get(key); v != "" {
			timeoutS = numberAsInt(v, timeoutS)
			break
		}
		if external != nil {
			if raw, ok := external[key]; ok {
				timeoutS = numberAsInt(raw, timeoutS)
				break
			}
		}
	}
	if timeoutS < 5 {
		timeoutS = 5
	}
	if timeoutS > 300 {
		timeoutS = 300
	}

	username := get("username")
	if username == "" {
		username = get("user")
	}
	password := secret("password")
	apiKey := secret("api_key")
	if apiKey == "" {
		apiKey = secret("apiKey")
	}
	bearer := secret("token")
	if bearer == "" {
		bearer = secret("bearer_token")
	}
	if bearer == "" {
		bearer = secret("bearerToken")
	}

	authMode := strings.ToLower(strings.TrimSpace(get("auth_mode")))
	if authMode == "" {
		authMode = strings.ToLower(strings.TrimSpace(get("authMode")))
	}
	// Backward compat: older connections have no auth_mode.
	if authMode == "" {
		switch {
		case apiKey != "":
			authMode = AuthAPIKey
		case bearer != "":
			authMode = AuthBearer
		case username != "" || password != "":
			authMode = AuthBasic
		default:
			authMode = AuthNone
		}
	}
	switch authMode {
	case AuthNone, AuthBasic, AuthAPIKey, AuthBearer:
	default:
		return nil, fmt.Errorf("auth_mode must be none, basic, api_key, or bearer (got %q)", authMode)
	}
	switch authMode {
	case AuthBasic:
		if username == "" {
			return nil, errors.New("username is required for basic authentication")
		}
	case AuthAPIKey:
		if apiKey == "" {
			return nil, errors.New("api_key is required for API key authentication")
		}
	case AuthBearer:
		if bearer == "" {
			return nil, errors.New("token is required for bearer authentication")
		}
	}

	defaultIndex := get("default_index")
	if defaultIndex == "" {
		defaultIndex = get("defaultIndex")
	}
	if defaultIndex == "" {
		defaultIndex = "logs-*"
	}

	insecure := boolean(
		get("insecure_skip_tls_verify"),
		get("insecureSkipTlsVerify"),
		external["insecure_skip_tls_verify"],
		external["insecureSkipTlsVerify"],
	)

	spaceID := strings.TrimSpace(get("space_id"))
	if spaceID == "" {
		spaceID = strings.TrimSpace(get("spaceId"))
	}
	// Allow space embedded in pasted URL path: /soc-v7-kibana/s/soc_space_sdp/...
	if spaceID == "" && pathFromURL != "" {
		parts := strings.Split(strings.Trim(pathFromURL, "/"), "/")
		for i := 0; i < len(parts)-1; i++ {
			if parts[i] == "s" {
				spaceID = parts[i+1]
				// Drop /s/{space}/... from base path when we parsed it as pathFromURL.
				if basePath == normalizeBasePath(pathFromURL) {
					baseParts := parts[:i]
					if len(baseParts) > 0 {
						basePath = "/" + strings.Join(baseParts, "/")
					} else {
						basePath = ""
					}
				}
				break
			}
		}
	}

	transport := strings.TrimSpace(strings.ToLower(get("transport")))
	if transport == "" {
		transport = "auto"
	}

	baseURL := fmt.Sprintf("%s://%s:%d", scheme, host, port)
	if _, err := url.Parse(baseURL); err != nil {
		return nil, fmt.Errorf("invalid kibana url: %w", err)
	}

	return &Config{
		ID:                    connectionID(values),
		BaseURL:               baseURL,
		KibanaBasePath:        basePath,
		SpaceID:               spaceID,
		Transport:             transport,
		AuthMode:              authMode,
		Username:              username,
		Password:              password,
		APIKey:                apiKey,
		BearerToken:           bearer,
		DefaultIndex:          defaultIndex,
		InsecureSkipTLSVerify: insecure,
		Timeout:               time.Duration(timeoutS) * time.Second,
	}, nil
}

func (m *connectionManager) put(cfg *Config) *Client {
	client := NewClient(cfg)
	m.putClient(cfg, client)
	return client
}

func (m *connectionManager) putClient(cfg *Config, client *Client) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if cfg == nil || cfg.ID == "" || client == nil {
		return
	}
	if old, ok := m.clients[cfg.ID]; ok && old != client {
		old.Close()
	}
	m.byID[cfg.ID] = cfg
	m.clients[cfg.ID] = client
}

func (m *connectionManager) get(id string) (*Client, *Config, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if id == "" {
		return nil, nil, errors.New("missing connectionId")
	}
	client, ok := m.clients[id]
	if !ok || client == nil {
		return nil, nil, fmt.Errorf("connection %s is not connected", id)
	}
	return client, m.byID[id], nil
}

func (m *connectionManager) remove(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if client, ok := m.clients[id]; ok {
		client.Close()
		delete(m.clients, id)
	}
	delete(m.byID, id)
}

func (m *connectionManager) info(cfg *Config) map[string]any {
	return map[string]any{
		"success":      true,
		"connectionId": cfg.ID,
		"message":      fmt.Sprintf("Connected to %s%s", cfg.BaseURL, cfg.KibanaBasePath),
		"target":       cfg.BaseURL + cfg.KibanaBasePath,
		"defaultIndex": cfg.DefaultIndex,
		"basePath":     cfg.KibanaBasePath,
		"spaceId":      cfg.SpaceID,
		"transport":    cfg.Transport,
		"authMode":     cfg.AuthMode,
	}
}
