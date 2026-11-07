package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"time"
)

type PolarisClient struct {
	cfg    ConnConfig
	http   *http.Client
	token  string
	userID string
}

func NewPolarisClient(cfg ConnConfig) *PolarisClient {
	tr := &http.Transport{}
	if cfg.InsecureSkipTLS {
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec
	}
	jar, _ := cookiejar.New(nil)
	return &PolarisClient{
		cfg: cfg,
		http: &http.Client{
			Timeout:   time.Duration(cfg.ConnectTimeoutSec) * time.Second,
			Transport: tr,
			Jar:       jar, // polaris-console puts real auth in jwt cookie
		},
		token: cfg.Token,
	}
}

func isMaskedToken(token string) bool {
	return token != "" && strings.Contains(token, "*")
}

func (c *PolarisClient) hasConsoleJWT() bool {
	if c.http.Jar == nil {
		return false
	}
	u, err := url.Parse(c.cfg.BaseURL)
	if err != nil {
		return false
	}
	for _, ck := range c.http.Jar.Cookies(u) {
		if strings.EqualFold(ck.Name, "jwt") && ck.Value != "" {
			return true
		}
	}
	return false
}

func (c *PolarisClient) Login() error {
	if c.cfg.AuthMethod == "token" || (c.token != "" && c.cfg.Username == "" && !isMaskedToken(c.token)) {
		if c.token == "" {
			return fmt.Errorf("token is required")
		}
		return nil
	}
	// Official login body is name+password. Owner is optional (sub-account); do not force default "polaris".
	payload := map[string]any{
		"name":     c.cfg.Username,
		"password": c.cfg.Password,
	}
	if owner := strings.TrimSpace(c.cfg.Owner); owner != "" && !strings.EqualFold(owner, "polaris") {
		payload["owner"] = owner
	}
	raw, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, c.cfg.BaseURL+"/core/v1/user/login", bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("login failed: HTTP %d: %s", resp.StatusCode, truncate(string(body), 300))
	}
	root := unwrapData(body)
	if code := firstNonEmpty(strVal(root, "code"), fmt.Sprintf("%v", root["code"])); code != "" && code != "200000" && code != "200" && code != "0" {
		return fmt.Errorf("login failed: code=%s msg=%s", code, strVal(root, "info", "message"))
	}
	login := asMap(root["loginResponse"])
	if len(login) == 0 {
		login = root
	}
	token := firstNonEmpty(strVal(login, "token"), strVal(root, "token"))
	userID := firstNonEmpty(strVal(login, "user_id", "userId"), strVal(root, "user_id", "userId"))

	// Console reverse-proxy masks token as ****** and writes real auth into Set-Cookie: jwt=...
	if isMaskedToken(token) {
		token = ""
		if !c.hasConsoleJWT() {
			// Also accept jwt from this response if jar missed Path/Domain edge cases.
			for _, ck := range resp.Cookies() {
				if strings.EqualFold(ck.Name, "jwt") && ck.Value != "" {
					if u, err := url.Parse(c.cfg.BaseURL); err == nil && c.http.Jar != nil {
						c.http.Jar.SetCookies(u, []*http.Cookie{ck})
					}
				}
			}
		}
		if !c.hasConsoleJWT() {
			return fmt.Errorf("login ok but console JWT cookie missing (token was masked). Use the PolarIS console URL, or paste a static user token instead")
		}
	}
	if token == "" && !c.hasConsoleJWT() {
		return fmt.Errorf("login succeeded but token missing")
	}
	c.token = token
	c.userID = userID
	return nil
}

func (c *PolarisClient) doJSON(method, path string, query url.Values, payload any) ([]byte, int, error) {
	u := c.cfg.BaseURL + path
	if query != nil {
		if enc := query.Encode(); enc != "" {
			u += "?" + enc
		}
	}
	var bodyReader io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return nil, 0, err
		}
		bodyReader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, u, bodyReader)
	if err != nil {
		return nil, 0, err
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	// Prefer real user token when talking to polaris-server directly.
	// Console mode relies on jwt cookie (jar); never send masked ****** tokens.
	if c.token != "" && !isMaskedToken(c.token) {
		req.Header.Set("X-Polaris-Token", c.token)
		req.Header.Set("Polaris-Token", c.token)
	}
	if c.userID != "" {
		req.Header.Set("X-Polaris-User", c.userID)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	return b, resp.StatusCode, err
}

func (c *PolarisClient) ensureOK(body []byte, code int, op string) (map[string]any, error) {
	root := unwrapData(body)
	biz := firstNonEmpty(strVal(root, "code"), fmt.Sprintf("%v", root["code"]))
	info := strVal(root, "info", "message")
	if code >= 400 {
		if biz != "" || info != "" {
			return nil, fmt.Errorf("%s: HTTP %d code=%s msg=%s", op, code, biz, firstNonEmpty(info, truncate(string(body), 240)))
		}
		return nil, fmt.Errorf("%s: HTTP %d: %s", op, code, truncate(string(body), 240))
	}
	if biz != "" && biz != "200000" && biz != "200" && biz != "0" {
		return nil, fmt.Errorf("%s: code=%s msg=%s", op, biz, info)
	}
	return root, nil
}

func (c *PolarisClient) Info() (map[string]any, error) {
	ns, err := c.Namespaces()
	if err != nil {
		return nil, err
	}
	total, _ := ns["totalCount"].(int)
	return map[string]any{
		"host":           c.cfg.Host,
		"baseUrl":        c.cfg.BaseURL,
		"authenticated":  c.token != "" || c.hasConsoleJWT(),
		"namespaceCount": total,
		"readOnly":       c.cfg.ReadOnly,
	}, nil
}

func (c *PolarisClient) Namespaces() (map[string]any, error) {
	body, code, err := c.doJSON(http.MethodGet, "/naming/v1/namespaces", nil, nil)
	if err != nil {
		return nil, err
	}
	root, err := c.ensureOK(body, code, "namespaces")
	if err != nil {
		return nil, err
	}
	items := listUnder(root, "namespaces", "data")
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, map[string]any{
			"name":    strVal(it, "name"),
			"comment": strVal(it, "comment"),
			"owners":  it["owners"],
			"ctime":   it["ctime"],
			"mtime":   it["mtime"],
		})
	}
	total := amountOf(root, len(out))
	return map[string]any{"namespaces": out, "totalCount": total}, nil
}

func (c *PolarisClient) ConfigGroups(namespace string, limit int) (map[string]any, error) {
	if limit <= 0 {
		limit = 200
	}
	q := url.Values{}
	q.Set("offset", "0")
	q.Set("limit", fmt.Sprintf("%d", limit))
	if namespace != "" {
		q.Set("namespace", namespace)
	}
	body, code, err := c.doJSON(http.MethodGet, "/config/v1/configfilegroups", q, nil)
	if err != nil {
		return nil, err
	}
	root, err := c.ensureOK(body, code, "config-groups")
	if err != nil {
		return nil, err
	}
	items := listUnder(root, "configFileGroups", "groups", "data")
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, map[string]any{
			"name":      strVal(it, "name"),
			"namespace": firstNonEmpty(strVal(it, "namespace"), namespace),
			"comment":   strVal(it, "comment"),
		})
	}
	return map[string]any{"groups": out, "totalCount": amountOf(root, len(out))}, nil
}

func (c *PolarisClient) ConfigsList(namespace, group, name string, limit int) (map[string]any, error) {
	if limit <= 0 {
		limit = 200
	}
	q := url.Values{}
	q.Set("offset", "0")
	q.Set("limit", fmt.Sprintf("%d", limit))
	if namespace != "" {
		q.Set("namespace", namespace)
	}
	if group != "" {
		q.Set("group", group)
	}
	if name != "" {
		q.Set("name", name)
	}
	body, code, err := c.doJSON(http.MethodGet, "/config/v1/configfiles/search", q, nil)
	if err != nil {
		return nil, err
	}
	root, err := c.ensureOK(body, code, "configs/list")
	if err != nil {
		return nil, err
	}
	items := listUnder(root, "configFiles", "files", "data")
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, map[string]any{
			"name":      strVal(it, "name"),
			"namespace": firstNonEmpty(strVal(it, "namespace"), namespace),
			"group":     firstNonEmpty(strVal(it, "group"), group),
			"format":    strVal(it, "format"),
			"comment":   strVal(it, "comment"),
		})
	}
	total, totalKnown := amountReported(root)
	if !totalKnown {
		total = len(out)
	}
	return map[string]any{
		"configs":    out,
		"totalCount": total,
		"truncated":  listPossiblyTruncated(len(out), total, limit, totalKnown),
	}, nil
}

func (c *PolarisClient) ConfigsGet(namespace, group, name string) (map[string]any, error) {
	q := url.Values{}
	q.Set("namespace", namespace)
	q.Set("group", group)
	q.Set("name", name)
	body, code, err := c.doJSON(http.MethodGet, "/config/v1/configfiles", q, nil)
	if err != nil {
		return nil, err
	}
	root, err := c.ensureOK(body, code, "configs/get")
	if err != nil {
		return nil, err
	}
	file := asMap(root["configFile"])
	if len(file) == 0 {
		file = asMap(root["data"])
	}
	if len(file) == 0 {
		file = root
	}
	return map[string]any{
		"name":      firstNonEmpty(strVal(file, "name"), name),
		"namespace": firstNonEmpty(strVal(file, "namespace"), namespace),
		"group":     firstNonEmpty(strVal(file, "group"), group),
		"content":   strVal(file, "content"),
		"format":    strVal(file, "format"),
		"md5":       strVal(file, "md5"),
	}, nil
}

func releaseVersionStamp() string {
	return time.Now().Format("20060102150405")
}

func (c *PolarisClient) releaseConfig(namespace, group, name, failPrefix string) (released bool, err error) {
	ver := releaseVersionStamp()
	release := map[string]any{
		"namespace": namespace,
		"group":     group,
		"file_name": name,
		"name":      ver,
		"comment":   "",
	}
	rBody, rCode, rErr := c.doJSON(http.MethodPost, "/config/v1/configfiles/release", nil, release)
	if rErr != nil {
		return false, fmt.Errorf("%s but release failed: %w", failPrefix, rErr)
	}
	// Some deployments expose mutate without a separate release route.
	if rCode == 404 {
		return false, nil
	}
	if _, err := c.ensureOK(rBody, rCode, "configs/release"); err != nil {
		return false, fmt.Errorf("%s but release failed: %w", failPrefix, err)
	}
	return true, nil
}

func (c *PolarisClient) ConfigsUpdate(namespace, group, name, content, format string) (map[string]any, error) {
	if c.cfg.ReadOnly {
		return nil, fmt.Errorf("read-only mode: update denied")
	}
	payload := map[string]any{
		"namespace": namespace,
		"group":     group,
		"name":      name,
		"content":   content,
	}
	if format != "" {
		payload["format"] = format
	}
	body, code, err := c.doJSON(http.MethodPut, "/config/v1/configfiles", nil, payload)
	if err != nil {
		return nil, err
	}
	if _, err := c.ensureOK(body, code, "configs/update"); err != nil {
		return nil, err
	}
	released, err := c.releaseConfig(namespace, group, name, "config updated")
	if err != nil {
		return nil, err
	}
	detail, err := c.ConfigsGet(namespace, group, name)
	if err != nil {
		return nil, err
	}
	detail["released"] = released
	detail["releaseSkipped"] = !released
	return detail, nil
}

func (c *PolarisClient) ConfigsCreate(namespace, group, name, content, format string) (map[string]any, error) {
	if c.cfg.ReadOnly {
		return nil, fmt.Errorf("read-only mode: create denied")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if group == "" {
		group = "DEFAULT"
	}
	if format == "" {
		format = "text"
	}
	payload := map[string]any{
		"namespace": namespace,
		"group":     group,
		"name":      name,
		"content":   content,
		"format":    format,
		"comment":   "",
	}
	body, code, err := c.doJSON(http.MethodPost, "/config/v1/configfiles", nil, payload)
	if err != nil {
		return nil, err
	}
	if _, err := c.ensureOK(body, code, "configs/create"); err != nil {
		return nil, err
	}
	released, err := c.releaseConfig(namespace, group, name, "config created")
	if err != nil {
		return nil, err
	}
	detail, err := c.ConfigsGet(namespace, group, name)
	if err != nil {
		return nil, err
	}
	detail["released"] = released
	detail["releaseSkipped"] = !released
	return detail, nil
}

func (c *PolarisClient) ConfigsDelete(namespace, group, name string) (map[string]any, error) {
	if c.cfg.ReadOnly {
		return nil, fmt.Errorf("read-only mode: delete denied")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	q := url.Values{}
	q.Set("namespace", namespace)
	q.Set("group", group)
	q.Set("name", name)
	body, code, err := c.doJSON(http.MethodDelete, "/config/v1/configfiles", q, nil)
	if err != nil {
		return nil, err
	}
	if _, err := c.ensureOK(body, code, "configs/delete"); err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "namespace": namespace, "group": group, "name": name}, nil
}

func (c *PolarisClient) ConfigsHistory(namespace, group, name string, limit int) (map[string]any, error) {
	if limit <= 0 {
		limit = 20
	}
	q := url.Values{}
	q.Set("namespace", namespace)
	q.Set("group", group)
	q.Set("name", name)
	q.Set("offset", "0")
	q.Set("limit", fmt.Sprintf("%d", limit))
	body, code, err := c.doJSON(http.MethodGet, "/config/v1/configfiles/releasehistory", q, nil)
	if err != nil {
		return nil, err
	}
	root, err := c.ensureOK(body, code, "configs/history")
	if err != nil {
		return nil, err
	}
	items := listUnder(root, "configFileReleaseHistories", "histories", "data")
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		// PolarIS OpenAPI uses createTime/modifyTime (not ctime/mtime).
		ctime := firstNonEmpty(strVal(it, "createTime", "create_time", "ctime"), fmt.Sprintf("%v", it["createTime"]))
		mtime := firstNonEmpty(strVal(it, "modifyTime", "modify_time", "mtime"), fmt.Sprintf("%v", it["modifyTime"]))
		if ctime == "<nil>" || ctime == "null" || ctime == "map[]" {
			ctime = ""
		}
		if mtime == "<nil>" || mtime == "null" || mtime == "map[]" {
			mtime = ""
		}
		id := strVal(it, "id")
		if id == "<nil>" || id == "null" || id == "map[]" {
			id = ""
		}
		out = append(out, map[string]any{
			"id":                 id,
			"name":               firstNonEmpty(strVal(it, "name"), name),
			"fileName":           firstNonEmpty(strVal(it, "fileName", "file_name"), name),
			"namespace":          firstNonEmpty(strVal(it, "namespace"), namespace),
			"group":              firstNonEmpty(strVal(it, "group"), group),
			"content":            strVal(it, "content"),
			"format":             strVal(it, "format"),
			"comment":            firstNonEmpty(strVal(it, "comment"), strVal(it, "releaseDescription", "release_description")),
			"releaseDescription": strVal(it, "releaseDescription", "release_description"),
			"md5":                strVal(it, "md5"),
			"type":               strVal(it, "type"),
			"status":             strVal(it, "status"),
			"ctime":              ctime,
			"mtime":              mtime,
			"createBy":           strVal(it, "createBy", "create_by"),
			"modifyBy":           strVal(it, "modifyBy", "modify_by"),
		})
	}
	return map[string]any{
		"histories":  out,
		"totalCount": amountOf(root, len(out)),
	}, nil
}

func (c *PolarisClient) NamespacesCreate(name, comment string) (map[string]any, error) {
	if c.cfg.ReadOnly {
		return nil, fmt.Errorf("read-only mode: namespace create denied")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("namespace name is required")
	}
	payload := []map[string]any{{"name": name, "comment": comment}}
	body, code, err := c.doJSON(http.MethodPost, "/naming/v1/namespaces", nil, payload)
	if err != nil {
		return nil, err
	}
	if _, err := c.ensureOK(body, code, "namespaces/create"); err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "name": name, "comment": comment}, nil
}

func (c *PolarisClient) NamespacesDelete(name string) (map[string]any, error) {
	if c.cfg.ReadOnly {
		return nil, fmt.Errorf("read-only mode: namespace delete denied")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("namespace name is required")
	}
	payload := []map[string]any{{"name": name}}
	body, code, err := c.doJSON(http.MethodPost, "/naming/v1/namespaces/delete", nil, payload)
	if err != nil {
		return nil, err
	}
	if _, err := c.ensureOK(body, code, "namespaces/delete"); err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "name": name}, nil
}

func (c *PolarisClient) ServicesList(namespace string, limit int) (map[string]any, error) {
	if limit <= 0 {
		limit = 200
	}
	q := url.Values{}
	q.Set("offset", "0")
	q.Set("limit", fmt.Sprintf("%d", limit))
	if namespace != "" {
		q.Set("namespace", namespace)
	}
	body, code, err := c.doJSON(http.MethodGet, "/naming/v1/services", q, nil)
	if err != nil {
		return nil, err
	}
	root, err := c.ensureOK(body, code, "services/list")
	if err != nil {
		return nil, err
	}
	items := listUnder(root, "services", "data")
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, map[string]any{
			"name":       strVal(it, "name"),
			"namespace":  firstNonEmpty(strVal(it, "namespace"), namespace),
			"owners":     it["owners"],
			"ports":      it["ports"],
			"business":   strVal(it, "business"),
			"department": strVal(it, "department"),
			"comment":    strVal(it, "comment"),
			"revision":   strVal(it, "revision"),
		})
	}
	total, totalKnown := amountReported(root)
	if !totalKnown {
		total = len(out)
	}
	return map[string]any{
		"services":   out,
		"totalCount": total,
		"truncated":  listPossiblyTruncated(len(out), total, limit, totalKnown),
	}, nil
}

func (c *PolarisClient) InstancesList(namespace, service string, limit int) (map[string]any, error) {
	if limit <= 0 {
		limit = 200
	}
	q := url.Values{}
	q.Set("offset", "0")
	q.Set("limit", fmt.Sprintf("%d", limit))
	q.Set("namespace", namespace)
	q.Set("service", service)
	body, code, err := c.doJSON(http.MethodGet, "/naming/v1/instances", q, nil)
	if err != nil {
		return nil, err
	}
	root, err := c.ensureOK(body, code, "instances/list")
	if err != nil {
		return nil, err
	}
	items := listUnder(root, "instances", "data")
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, map[string]any{
			"id":        strVal(it, "id"),
			"host":      strVal(it, "host"),
			"port":      it["port"],
			"protocol":  strVal(it, "protocol"),
			"version":   strVal(it, "version"),
			"weight":    it["weight"],
			"healthy":   it["healthy"],
			"isolate":   it["isolate"],
			"namespace": firstNonEmpty(strVal(it, "namespace"), namespace),
			"service":   firstNonEmpty(strVal(it, "service"), service),
		})
	}
	total, totalKnown := amountReported(root)
	if !totalKnown {
		total = len(out)
	}
	return map[string]any{
		"instances":  out,
		"totalCount": total,
		"truncated":  listPossiblyTruncated(len(out), total, limit, totalKnown),
	}, nil
}

func unwrapData(body []byte) map[string]any {
	var raw any
	if err := json.Unmarshal(body, &raw); err != nil {
		return map[string]any{}
	}
	root := asMap(raw)
	if data := asMap(root["data"]); len(data) > 0 {
		// keep code/info from root when present
		if _, ok := data["code"]; !ok {
			if v, ok := root["code"]; ok {
				data["code"] = v
			}
		}
		if _, ok := data["info"]; !ok {
			if v, ok := root["info"]; ok {
				data["info"] = v
			}
		}
		for _, k := range []string{"namespaces", "services", "instances", "configFiles", "configFileGroups", "configFileReleaseHistories", "amount", "totalCount", "configFile"} {
			if _, ok := data[k]; !ok {
				if v, ok := root[k]; ok {
					data[k] = v
				}
			}
		}
		return data
	}
	return root
}

func listUnder(root map[string]any, keys ...string) []map[string]any {
	for _, k := range keys {
		if arr, ok := root[k].([]any); ok {
			return toObjSlice(arr)
		}
	}
	return nil
}

func toObjSlice(arr []any) []map[string]any {
	out := make([]map[string]any, 0, len(arr))
	for _, el := range arr {
		if m, ok := el.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func amountOf(root map[string]any, fallback int) int {
	if n, ok := amountReported(root); ok {
		return n
	}
	return fallback
}

func amountReported(root map[string]any) (int, bool) {
	if n := intVal(root, 0, "amount", "totalCount", "total"); n > 0 {
		return n, true
	}
	return 0, false
}

/** listPossiblyTruncated: known total>loaded, or unknown total with a full page. */
func listPossiblyTruncated(loaded, total, pageSize int, totalKnown bool) bool {
	if totalKnown && total > loaded {
		return true
	}
	return !totalKnown && loaded >= pageSize && pageSize > 0
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
