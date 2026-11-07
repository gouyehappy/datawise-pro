package main

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
)

const kibanaProxyStatusHeader = "x-console-proxy-status-code"

type TransportMode string

const (
	TransportAuto              TransportMode = "auto"
	TransportConsoleProxy      TransportMode = "console_proxy"
	TransportElasticsearchProxy TransportMode = "elasticsearch_proxy"
)

// Client talks to Elasticsearch through Kibana — either modern console proxy
// (/api/console/proxy) or Kibana 7.x limited elasticsearch proxy (/elasticsearch/_msearch).
type Client struct {
	cfg        *Config
	httpClient *http.Client
	mode       TransportMode
	loggedIn   bool
}

func NewClient(cfg *Config) *Client {
	jar, _ := cookiejar.New(nil)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if cfg.InsecureSkipTLSVerify {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec
	}
	mode := TransportMode(strings.TrimSpace(cfg.Transport))
	if mode == "" {
		mode = TransportAuto
	}
	return &Client{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout:   cfg.Timeout,
			Transport: transport,
			Jar:       jar,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return fmt.Errorf("too many redirects")
				}
				return nil
			},
		},
		mode: mode,
	}
}

func (c *Client) Close() {
	if c == nil || c.httpClient == nil {
		return
	}
	c.httpClient.CloseIdleConnections()
}

func (c *Client) Mode() TransportMode { return c.mode }

type RestResponse struct {
	Status int
	Body   string
	Method string
	Path   string
}

type ProbeResult struct {
	OK         bool   `json:"ok"`
	Message    string `json:"message"`
	BasePath   string `json:"basePath,omitempty"`
	SpaceID    string `json:"spaceId,omitempty"`
	Transport  string `json:"transport,omitempty"`
	KibanaName string `json:"kibanaName,omitempty"`
	Version    string `json:"version,omitempty"`
}

func (c *Client) kibanaRoot() string {
	return strings.TrimRight(c.cfg.BaseURL+c.cfg.KibanaBasePath, "/")
}

func (c *Client) spacePrefix() string {
	space := strings.Trim(strings.TrimSpace(c.cfg.SpaceID), "/")
	if space == "" {
		return ""
	}
	return "/s/" + space
}

func (c *Client) applyAuth(req *http.Request) {
	switch c.cfg.AuthMode {
	case AuthBasic:
		if c.cfg.Username != "" {
			token := base64.StdEncoding.EncodeToString([]byte(c.cfg.Username + ":" + c.cfg.Password))
			req.Header.Set("Authorization", "Basic "+token)
		}
	case AuthAPIKey:
		if key := strings.TrimSpace(c.cfg.APIKey); key != "" {
			// Accept either raw id:api_key or already Base64-encoded value.
			if strings.Contains(key, ":") && !looksBase64(key) {
				key = base64.StdEncoding.EncodeToString([]byte(key))
			}
			req.Header.Set("Authorization", "ApiKey "+key)
		}
	case AuthBearer:
		if token := strings.TrimSpace(c.cfg.BearerToken); token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
	}
	req.Header.Set("kbn-xsrf", "true")
	req.Header.Set("osd-xsrf", "true")
}

func looksBase64(s string) bool {
	if s == "" || strings.ContainsAny(s, ": \t\r\n") {
		return false
	}
	_, err := base64.StdEncoding.DecodeString(s)
	return err == nil
}

func (c *Client) doHTTP(method, rawURL string, body []byte, contentType string) (*RestResponse, error) {
	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, rawURL, reader)
	if err != nil {
		return nil, err
	}
	c.applyAuth(req)
	req.Header.Set("Accept", "application/json")
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	} else if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, err
	}
	status := resp.StatusCode
	if proxyStatus := resp.Header.Get(kibanaProxyStatusHeader); proxyStatus != "" {
		if n, err := parseInt(proxyStatus); err == nil {
			status = n
		}
	}
	return &RestResponse{Status: status, Body: string(raw), Method: method, Path: rawURL}, nil
}

// Login performs Kibana session auth when using username/password.
// API key / bearer / anonymous skip cookie login and rely on Authorization headers.
func (c *Client) Login() error {
	mode := c.cfg.AuthMode
	if mode == "" {
		if c.cfg.Username != "" {
			mode = AuthBasic
		} else {
			mode = AuthNone
		}
	}
	if mode != AuthBasic {
		c.loggedIn = true
		return nil
	}
	if c.cfg.Username == "" {
		c.loggedIn = true
		return nil
	}
	payload, _ := json.Marshal(map[string]string{
		"username": c.cfg.Username,
		"password": c.cfg.Password,
	})
	loginURL := c.kibanaRoot() + "/api/security/v1/login"
	resp, err := c.doHTTP(http.MethodPost, loginURL, payload, "application/json")
	if err != nil {
		return err
	}
	// 204 No Content is success on Kibana 7.x; some builds return 200.
	if resp.Status == 204 || (resp.Status >= 200 && resp.Status < 300) {
		c.loggedIn = true
		return nil
	}
	// Fallback: older/newer login path.
	alt := c.kibanaRoot() + "/internal/security/login"
	altBody, _ := json.Marshal(map[string]any{
		"providerType": "basic",
		"providerName": "basic",
		"currentURL":   "/",
		"params": map[string]string{
			"username": c.cfg.Username,
			"password": c.cfg.Password,
		},
	})
	resp2, err2 := c.doHTTP(http.MethodPost, alt, altBody, "application/json")
	if err2 == nil && (resp2.Status == 204 || (resp2.Status >= 200 && resp2.Status < 300)) {
		c.loggedIn = true
		return nil
	}
	msg := strings.TrimSpace(resp.Body)
	if len(msg) > 200 {
		msg = msg[:200] + "…"
	}
	if msg == "" {
		msg = http.StatusText(resp.Status)
	}
	return fmt.Errorf("kibana login failed (%d): %s", resp.Status, msg)
}

func (c *Client) ensureSession() error {
	if c.loggedIn {
		return nil
	}
	return c.Login()
}

// DetectBasePath follows GET / redirect Location like /soc-v7-kibana/s/space/app/kibana.
func (c *Client) DetectBasePath() (basePath, spaceID string, err error) {
	client := &http.Client{
		Timeout:   c.cfg.Timeout,
		Transport: c.httpClient.Transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	req, err := http.NewRequest(http.MethodGet, c.cfg.BaseURL+"/", nil)
	if err != nil {
		return "", "", err
	}
	c.applyAuth(req)
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	loc := resp.Header.Get("Location")
	if loc == "" {
		return "", "", nil
	}
	u, err := url.Parse(loc)
	if err != nil {
		return "", "", nil
	}
	path := u.EscapedPath()
	// /soc-v7-kibana/s/soc_space_sdp/app/kibana
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 {
		return "", "", nil
	}
	baseParts := []string{}
	for i := 0; i < len(parts); i++ {
		if parts[i] == "s" && i+1 < len(parts) {
			spaceID = parts[i+1]
			break
		}
		if parts[i] == "app" || parts[i] == "login" {
			break
		}
		baseParts = append(baseParts, parts[i])
	}
	if len(baseParts) > 0 {
		basePath = "/" + strings.Join(baseParts, "/")
	}
	return basePath, spaceID, nil
}

func (c *Client) Probe() (*ProbeResult, error) {
	// Fill missing base path / space from root redirect when possible.
	if c.cfg.KibanaBasePath == "" {
		if bp, space, err := c.DetectBasePath(); err == nil {
			if bp != "" {
				c.cfg.KibanaBasePath = bp
			}
			if space != "" && c.cfg.SpaceID == "" {
				c.cfg.SpaceID = space
			}
		}
	}

	statusURL := c.kibanaRoot() + "/api/status"
	statusResp, err := c.doHTTP(http.MethodGet, statusURL, nil, "")
	if err != nil {
		return &ProbeResult{OK: false, Message: err.Error()}, nil
	}
	if statusResp.Status == 404 && c.cfg.KibanaBasePath == "" {
		return &ProbeResult{
			OK: false,
			Message: "Kibana /api/status returned 404. This host is not at the site root — " +
				"set Kibana Base Path (e.g. /soc-v7-kibana) or paste the full Kibana URL.",
		}, nil
	}
	if statusResp.Status < 200 || statusResp.Status >= 300 {
		return &ProbeResult{
			OK:      false,
			Message: fmt.Sprintf("Kibana /api/status failed (%d). Check host/base path/credentials.", statusResp.Status),
			BasePath: c.cfg.KibanaBasePath,
		}, nil
	}

	version, name := parseStatusMeta(statusResp.Body)
	if err := c.Login(); err != nil {
		return &ProbeResult{
			OK:         false,
			Message:    err.Error(),
			BasePath:   c.cfg.KibanaBasePath,
			SpaceID:    c.cfg.SpaceID,
			KibanaName: name,
			Version:    version,
		}, nil
	}

	// Prefer explicit transport; otherwise auto-detect.
	tryOrder := []TransportMode{c.mode}
	if c.mode == TransportAuto {
		tryOrder = []TransportMode{TransportConsoleProxy, TransportElasticsearchProxy}
	}
	var lastMsg string
	for _, mode := range tryOrder {
		ok, msg := c.probeTransport(mode)
		if ok {
			c.mode = mode
			return &ProbeResult{
				OK:         true,
				Message:    fmt.Sprintf("Connected to %s%s (%s, Kibana %s)", c.cfg.BaseURL, c.cfg.KibanaBasePath, mode, version),
				BasePath:   c.cfg.KibanaBasePath,
				SpaceID:    c.cfg.SpaceID,
				Transport:  string(mode),
				KibanaName: name,
				Version:    version,
			}, nil
		}
		lastMsg = msg
	}
	return &ProbeResult{
		OK:         false,
		Message:    "Kibana reachable but ES proxy probe failed: " + lastMsg,
		BasePath:   c.cfg.KibanaBasePath,
		SpaceID:    c.cfg.SpaceID,
		KibanaName: name,
		Version:    version,
	}, nil
}

func (c *Client) probeTransport(mode TransportMode) (bool, string) {
	switch mode {
	case TransportConsoleProxy:
		resp, err := c.requestConsoleProxy("GET", "/", nil)
		if err != nil {
			return false, err.Error()
		}
		if resp.Status == 404 {
			return false, "console proxy /api/console/proxy returned 404 (often disabled on Kibana 7.x)"
		}
		if resp.Status >= 200 && resp.Status < 300 {
			return true, ""
		}
		return false, fmt.Sprintf("console proxy status %d", resp.Status)
	case TransportElasticsearchProxy:
		nd := "{}\n{\"size\":0,\"query\":{\"match_none\":{}}}\n"
		resp, err := c.requestElasticsearchProxy(http.MethodPost, "/_msearch", []byte(nd), "application/x-ndjson")
		if err != nil {
			return false, err.Error()
		}
		if resp.Status >= 200 && resp.Status < 300 {
			return true, ""
		}
		return false, fmt.Sprintf("elasticsearch/_msearch status %d: %s", resp.Status, truncate(resp.Body, 160))
	default:
		return false, "unknown transport"
	}
}

func parseStatusMeta(body string) (version, name string) {
	var parsed struct {
		Name    string `json:"name"`
		Version struct {
			Number string `json:"number"`
		} `json:"version"`
	}
	_ = json.Unmarshal([]byte(body), &parsed)
	return parsed.Version.Number, parsed.Name
}

func (c *Client) Request(method, path string, body []byte) (*RestResponse, error) {
	if err := c.ensureSession(); err != nil {
		return nil, err
	}
	mode := c.mode
	if mode == TransportAuto {
		mode = TransportElasticsearchProxy
	}
	switch mode {
	case TransportConsoleProxy:
		return c.requestConsoleProxy(method, path, body)
	default:
		ct := "application/json"
		if strings.HasSuffix(path, "/_msearch") || path == "/_msearch" {
			ct = "application/x-ndjson"
		}
		return c.requestElasticsearchProxy(method, path, body, ct)
	}
}

func (c *Client) requestConsoleProxy(method, path string, body []byte) (*RestResponse, error) {
	method = strings.ToUpper(strings.TrimSpace(method))
	if method == "" {
		method = "GET"
	}
	path = normalizePath(path)
	proxyURL := c.kibanaRoot() + c.spacePrefix() + "/api/console/proxy?path=" +
		url.QueryEscape(path) + "&method=" + url.QueryEscape(method)
	return c.doHTTP(http.MethodPost, proxyURL, body, "application/json")
}

func (c *Client) requestElasticsearchProxy(method, path string, body []byte, contentType string) (*RestResponse, error) {
	method = strings.ToUpper(strings.TrimSpace(method))
	if method == "" {
		method = "GET"
	}
	path = normalizePath(path)
	// Kibana 7.x only exposes a small subset under /elasticsearch.
	esURL := c.kibanaRoot() + "/elasticsearch" + path
	return c.doHTTP(method, esURL, body, contentType)
}

func (c *Client) RequestJSON(method, path string, payload any) (json.RawMessage, int, error) {
	var body []byte
	var err error
	if payload != nil {
		body, err = json.Marshal(payload)
		if err != nil {
			return nil, 0, err
		}
	}
	resp, err := c.Request(method, path, body)
	if err != nil {
		return nil, 0, err
	}
	if resp.Status < 200 || resp.Status >= 300 {
		return nil, resp.Status, fmt.Errorf("elasticsearch %s %s failed (%d): %s", method, path, resp.Status, truncate(resp.Body, 400))
	}
	if strings.TrimSpace(resp.Body) == "" {
		return json.RawMessage(`{}`), resp.Status, nil
	}
	if !json.Valid([]byte(resp.Body)) {
		return nil, resp.Status, fmt.Errorf("non-JSON response from elasticsearch (%d)", resp.Status)
	}
	return json.RawMessage(resp.Body), resp.Status, nil
}

// MSearch sends a single-index _msearch request (Kibana 7 elasticsearch proxy).
func (c *Client) MSearch(index string, searchBody map[string]any) (json.RawMessage, error) {
	if err := c.ensureSession(); err != nil {
		return nil, err
	}
	header := map[string]any{"index": index}
	h, err := json.Marshal(header)
	if err != nil {
		return nil, err
	}
	b, err := json.Marshal(searchBody)
	if err != nil {
		return nil, err
	}
	nd := string(h) + "\n" + string(b) + "\n"
	resp, err := c.requestElasticsearchProxy(http.MethodPost, "/_msearch", []byte(nd), "application/x-ndjson")
	if err != nil {
		return nil, err
	}
	if resp.Status < 200 || resp.Status >= 300 {
		return nil, fmt.Errorf("elasticsearch _msearch failed (%d): %s", resp.Status, truncate(resp.Body, 400))
	}
	return json.RawMessage(resp.Body), nil
}

// KibanaAPI calls a Kibana HTTP API (not ES), optionally under the selected space.
func (c *Client) KibanaAPI(method, path string, body []byte) (*RestResponse, error) {
	if err := c.ensureSession(); err != nil {
		return nil, err
	}
	path = normalizePath(path)
	apiURL := c.kibanaRoot() + c.spacePrefix() + path
	return c.doHTTP(method, apiURL, body, "application/json")
}

func normalizePath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return "/"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return path
}

func parseInt(s string) (int, error) {
	var n int
	_, err := fmt.Sscanf(strings.TrimSpace(s), "%d", &n)
	return n, err
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
