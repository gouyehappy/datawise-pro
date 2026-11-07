package main

import (
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type NacosClient struct {
	cfg    ConnConfig
	http   *http.Client
	mu     sync.Mutex
	token  string
	authed bool
}

func NewNacosClient(cfg ConnConfig) *NacosClient {
	tr := &http.Transport{}
	if cfg.InsecureSkipTLS {
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec
	}
	return &NacosClient{
		cfg: cfg,
		http: &http.Client{
			Timeout:   time.Duration(cfg.ConnectTimeoutSec) * time.Second,
			Transport: tr,
		},
	}
}

func (c *NacosClient) Login() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.loginLocked()
}

func (c *NacosClient) loginLocked() error {
	if c.cfg.AuthMode == "access_key" {
		if strings.TrimSpace(c.cfg.AccessKey) == "" || strings.TrimSpace(c.cfg.SecretKey) == "" {
			return fmt.Errorf("access_key and secret_key are required")
		}
		c.authed = true
		c.token = ""
		return nil
	}
	if strings.TrimSpace(c.cfg.Username) == "" {
		c.authed = false
		c.token = ""
		return nil
	}
	path := "/v1/auth/login"
	if c.cfg.V3API {
		path = "/v3/auth/user/login"
	}
	form := url.Values{}
	form.Set("username", c.cfg.Username)
	form.Set("password", c.cfg.Password)
	req, err := http.NewRequest(http.MethodPost, c.cfg.BaseURL+path, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("login failed: HTTP %d: %s", resp.StatusCode, truncate(string(body), 200))
	}
	if err := loginBizError(body); err != nil {
		return err
	}
	token := extractToken(body)
	// Some Nacos deployments (custom/gateway) validate username/password with HTTP 200
	// but return an empty accessToken. Open APIs then work without a token; wrong
	// passwords still fail with HTTP 4xx. Accept empty token when the body looks
	// like a normal login success payload.
	if token == "" && !loginAllowsEmptyToken(body) {
		return fmt.Errorf("login succeeded but accessToken missing: %s", truncate(string(body), 200))
	}
	c.token = token
	c.authed = true
	return nil
}

func extractToken(body []byte) string {
	var raw any
	if err := json.Unmarshal(body, &raw); err != nil {
		return ""
	}
	m := asMap(raw)
	if data := asMap(m["data"]); len(data) > 0 {
		if t := strVal(data, "accessToken", "access_token", "token"); t != "" {
			return t
		}
	}
	return strVal(m, "accessToken", "access_token", "token")
}

/** loginAllowsEmptyToken: success-shaped body even when accessToken is blank. */
func loginAllowsEmptyToken(body []byte) bool {
	var raw any
	if err := json.Unmarshal(body, &raw); err != nil {
		return false
	}
	m := asMap(raw)
	check := func(x map[string]any) bool {
		if len(x) == 0 {
			return false
		}
		if strVal(x, "username", "userName", "user_name") != "" {
			return true
		}
		if _, ok := x["tokenTtl"]; ok {
			return true
		}
		if _, ok := x["token_ttl"]; ok {
			return true
		}
		if _, ok := x["globalAdmin"]; ok {
			return true
		}
		if _, ok := x["global_admin"]; ok {
			return true
		}
		// Explicit empty accessToken key still means login endpoint responded OK.
		if _, ok := x["accessToken"]; ok {
			return true
		}
		if _, ok := x["access_token"]; ok {
			return true
		}
		return false
	}
	if data := asMap(m["data"]); check(data) {
		return true
	}
	return check(m)
}

/** loginBizError treats non-success Nacos login codes as failures even when HTTP is 200. */
func loginBizError(body []byte) error {
	var raw any
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil
	}
	m := asMap(raw)
	if data := asMap(m["data"]); len(data) > 0 {
		if err := loginCodeError(data); err != nil {
			return err
		}
	}
	return loginCodeError(m)
}

func loginCodeError(m map[string]any) error {
	if len(m) == 0 {
		return nil
	}
	code := firstNonEmpty(strVal(m, "code"), fmt.Sprintf("%v", m["code"]))
	if code == "" || code == "<nil>" {
		return nil
	}
	switch code {
	case "0", "200", "20000", "true":
		return nil
	}
	msg := firstNonEmpty(strVal(m, "message", "msg", "error", "info"), truncate(fmt.Sprintf("%v", m), 160))
	return fmt.Errorf("login failed: code=%s msg=%s", code, msg)
}

func (c *NacosClient) do(method, path string, query url.Values, form url.Values) ([]byte, int, error) {
	body, code, err := c.doOnce(method, path, query, form)
	if err != nil {
		return body, code, err
	}
	if (code == 401 || code == 403) && strings.TrimSpace(c.cfg.Username) != "" {
		c.mu.Lock()
		loginErr := c.loginLocked()
		c.mu.Unlock()
		if loginErr == nil {
			return c.doOnce(method, path, query, form)
		}
	}
	return body, code, nil
}

func (c *NacosClient) doOnce(method, path string, query url.Values, form url.Values) ([]byte, int, error) {
	if query == nil {
		query = url.Values{}
	} else {
		// Clone so retries do not accumulate duplicate accessToken keys.
		cloned := url.Values{}
		for k, vs := range query {
			cloned[k] = append([]string{}, vs...)
		}
		query = cloned
	}
	query.Del("accessToken")
	c.mu.Lock()
	token := c.token
	c.mu.Unlock()
	if token != "" {
		query.Set("accessToken", token)
	}
	u := c.cfg.BaseURL + path
	if enc := query.Encode(); enc != "" {
		u += "?" + enc
	}
	var bodyReader io.Reader
	if form != nil {
		bodyReader = strings.NewReader(form.Encode())
	}
	req, err := http.NewRequest(method, u, bodyReader)
	if err != nil {
		return nil, 0, err
	}
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	if c.cfg.AccessKey != "" && c.cfg.SecretKey != "" {
		g, tenant := extractSpasGroupTenant(query, form)
		signSpasHeaders(req, c.cfg.AccessKey, c.cfg.SecretKey, g, tenant)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	return b, resp.StatusCode, err
}

func (c *NacosClient) Info() (map[string]any, error) {
	ns, err := c.Namespaces()
	if err != nil {
		return nil, err
	}
	total := intVal(ns, 0, "totalCount", "total")
	if total == 0 {
		if arr, ok := ns["namespaces"].([]map[string]any); ok {
			total = len(arr)
		} else if arr, ok := ns["namespaces"].([]any); ok {
			total = len(arr)
		}
	}
	c.mu.Lock()
	authed := c.authed
	c.mu.Unlock()
	return map[string]any{
		"host":             c.cfg.Host,
		"baseUrl":          c.cfg.BaseURL,
		"authenticated":    authed,
		"namespaceCount":   total,
		"v3Api":            c.cfg.V3API,
		"readOnly":         c.cfg.ReadOnly,
		"implementation":   c.cfg.Implementation,
		"versionMode":      c.cfg.VersionMode,
		"defaultNamespace": normalizeNamespaceID(c.cfg.Namespace),
	}, nil
}

func normalizeNamespaceID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" || strings.EqualFold(id, "public") || strings.EqualFold(id, "public_namespace") {
		return ""
	}
	return id
}

func (c *NacosClient) Namespaces() (map[string]any, error) {
	path := "/v1/console/namespaces"
	if c.cfg.V3API {
		path = "/v3/console/core/namespace/list"
	}
	body, code, err := c.do(http.MethodGet, path, nil, nil)
	if err != nil {
		return nil, err
	}
	if code >= 400 {
		return nil, fmt.Errorf("namespaces: HTTP %d: %s", code, truncate(string(body), 200))
	}
	items := parseObjectList(body, "data", "namespaces")
	out := make([]map[string]any, 0, len(items))
	seenPublic := false
	for _, it := range items {
		rawID := strVal(it, "namespace", "namespaceId", "tenant")
		id := normalizeNamespaceID(rawID)
		name := firstNonEmpty(strVal(it, "namespaceShowName", "namespaceName", "name"), rawID)
		if id == "" {
			seenPublic = true
			if name == "" || strings.EqualFold(name, "public") {
				name = "public"
			}
		}
		out = append(out, map[string]any{
			"id":          id,
			"name":        name,
			"desc":        strVal(it, "namespaceDesc", "desc"),
			"quota":       it["quota"],
			"configCount": it["configCount"],
			"type":        it["type"],
		})
	}
	if !seenPublic {
		out = append([]map[string]any{{
			"id":   "",
			"name": "public",
		}}, out...)
	}
	return map[string]any{"namespaces": out, "totalCount": len(out)}, nil
}

func (c *NacosClient) ConfigsList(namespaceID, dataID, group string, pageSize, pageNo int) (map[string]any, error) {
	namespaceID = normalizeNamespaceID(namespaceID)
	if pageSize <= 0 {
		pageSize = 200
	}
	if pageNo <= 0 {
		pageNo = 1
	}
	// Nacos blur search expects dataId/group keys even when empty (same as first-party RestClient).
	q := url.Values{}
	q.Set("search", "blur")
	q.Set("pageNo", fmt.Sprintf("%d", pageNo))
	q.Set("pageSize", fmt.Sprintf("%d", pageSize))
	q.Set("dataId", dataID)
	path := "/v1/cs/configs"
	if c.cfg.V3API {
		path = "/v3/console/cs/config/list"
		q.Set("groupName", group)
		q.Set("namespaceId", namespaceID)
	} else {
		q.Set("group", group)
		q.Set("tenant", namespaceID)
	}
	body, code, err := c.do(http.MethodGet, path, q, nil)
	if err != nil {
		return nil, err
	}
	if code >= 400 {
		return nil, fmt.Errorf("configs/list: HTTP %d: %s", code, truncate(string(body), 200))
	}
	items := parseObjectList(body, "pageItems", "data", "configs")
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, map[string]any{
			"dataId":  strVal(it, "dataId"),
			"group":   firstNonEmpty(strVal(it, "group", "groupName"), "DEFAULT_GROUP"),
			"tenant":  normalizeNamespaceID(firstNonEmpty(strVal(it, "tenant", "namespaceId"), namespaceID)),
			"type":    strVal(it, "type"),
			"appName": strVal(it, "appName"),
			"md5":     strVal(it, "md5"),
		})
	}
	total := 0
	totalKnown := false
	var root map[string]any
	_ = json.Unmarshal(body, &root)
	if data := asMap(root["data"]); len(data) > 0 {
		if n := intVal(data, 0, "totalCount", "total"); n > 0 {
			total, totalKnown = n, true
		}
	}
	if !totalKnown {
		if n := intVal(root, 0, "totalCount", "total"); n > 0 {
			total, totalKnown = n, true
		}
	}
	if !totalKnown {
		total = len(out)
	}
	return map[string]any{
		"configs":    out,
		"totalCount": total,
		"pageSize":   pageSize,
		"pageNo":     pageNo,
		"truncated":  listPossiblyTruncated(len(out), total, pageSize, totalKnown),
	}, nil
}

func (c *NacosClient) ConfigsGet(dataID, group, namespaceID string) (map[string]any, error) {
	namespaceID = normalizeNamespaceID(namespaceID)
	if group == "" {
		group = "DEFAULT_GROUP"
	}
	q := url.Values{}
	q.Set("dataId", dataID)
	path := "/v1/cs/configs"
	if c.cfg.V3API {
		path = "/v3/console/cs/config"
		q.Set("groupName", group)
		q.Set("namespaceId", namespaceID)
	} else {
		q.Set("show", "all")
		q.Set("group", group)
		q.Set("tenant", namespaceID)
	}
	body, code, err := c.do(http.MethodGet, path, q, nil)
	if err != nil {
		return nil, err
	}
	if code >= 400 {
		return nil, fmt.Errorf("configs/get: HTTP %d: %s", code, truncate(string(body), 200))
	}
	var asObj map[string]any
	if err := json.Unmarshal(body, &asObj); err == nil && asObj != nil {
		content := strVal(asObj, "content")
		if content == "" {
			if data := asMap(asObj["data"]); len(data) > 0 {
				asObj = data
				content = strVal(asObj, "content")
			}
		}
		if content != "" || strVal(asObj, "dataId") != "" {
			return map[string]any{
				"dataId":  firstNonEmpty(strVal(asObj, "dataId"), dataID),
				"group":   firstNonEmpty(strVal(asObj, "group", "groupName"), group),
				"tenant":  firstNonEmpty(strVal(asObj, "tenant", "namespaceId"), namespaceID),
				"content": content,
				"type":    strVal(asObj, "type"),
				"md5":     strVal(asObj, "md5"),
				"appName": strVal(asObj, "appName"),
			}, nil
		}
	}
	return map[string]any{
		"dataId":  dataID,
		"group":   group,
		"tenant":  namespaceID,
		"content": string(body),
		"type":    "",
		"md5":     "",
		"appName": "",
	}, nil
}

func publishSucceeded(body []byte, code int) bool {
	if code >= 400 {
		return false
	}
	ok := strings.TrimSpace(string(body))
	if ok == "" {
		return true
	}
	if strings.EqualFold(ok, "false") {
		return false
	}
	if strings.EqualFold(ok, "true") {
		return true
	}
	var raw any
	if err := json.Unmarshal(body, &raw); err != nil {
		return true
	}
	switch t := raw.(type) {
	case bool:
		return t
	case map[string]any:
		if v, ok := t["data"]; ok {
			switch d := v.(type) {
			case bool:
				return d
			case string:
				return !strings.EqualFold(d, "false")
			}
		}
		if v, ok := t["code"]; ok {
			s := fmt.Sprintf("%v", v)
			return s == "0" || s == "200" || s == "20000" || s == "true"
		}
	}
	return true
}

func (c *NacosClient) ConfigsPublish(dataID, group, namespaceID, content, typ string) (map[string]any, error) {
	if c.cfg.ReadOnly {
		return nil, fmt.Errorf("read-only mode: publish denied")
	}
	dataID = strings.TrimSpace(dataID)
	if dataID == "" {
		return nil, fmt.Errorf("dataId is required")
	}
	namespaceID = normalizeNamespaceID(namespaceID)
	if group == "" {
		group = "DEFAULT_GROUP"
	}
	form := url.Values{}
	form.Set("dataId", dataID)
	form.Set("content", content)
	path := "/v1/cs/configs"
	if c.cfg.V3API {
		path = "/v3/console/cs/config"
		form.Set("groupName", group)
		form.Set("namespaceId", namespaceID)
	} else {
		form.Set("group", group)
		form.Set("tenant", namespaceID)
	}
	if typ != "" {
		form.Set("type", typ)
	}
	body, code, err := c.do(http.MethodPost, path, nil, form)
	if err != nil {
		return nil, err
	}
	if !publishSucceeded(body, code) {
		return nil, fmt.Errorf("configs/publish: HTTP %d: %s", code, truncate(string(body), 200))
	}
	return c.ConfigsGet(dataID, group, namespaceID)
}

func (c *NacosClient) ConfigsDelete(dataID, group, namespaceID string) (map[string]any, error) {
	if c.cfg.ReadOnly {
		return nil, fmt.Errorf("read-only mode: delete denied")
	}
	dataID = strings.TrimSpace(dataID)
	if dataID == "" {
		return nil, fmt.Errorf("dataId is required")
	}
	namespaceID = normalizeNamespaceID(namespaceID)
	if group == "" {
		group = "DEFAULT_GROUP"
	}
	q := url.Values{}
	q.Set("dataId", dataID)
	path := "/v1/cs/configs"
	if c.cfg.V3API {
		path = "/v3/console/cs/config"
		q.Set("groupName", group)
		q.Set("namespaceId", namespaceID)
	} else {
		q.Set("group", group)
		q.Set("tenant", namespaceID)
	}
	body, code, err := c.do(http.MethodDelete, path, q, nil)
	if err != nil {
		return nil, err
	}
	if !publishSucceeded(body, code) {
		return nil, fmt.Errorf("configs/delete: HTTP %d: %s", code, truncate(string(body), 200))
	}
	return map[string]any{"ok": true, "dataId": dataID, "group": group, "tenant": namespaceID}, nil
}

func (c *NacosClient) ServicesList(namespaceID string, pageSize int) (map[string]any, error) {
	namespaceID = normalizeNamespaceID(namespaceID)
	if pageSize <= 0 {
		pageSize = 200
	}
	q := url.Values{}
	q.Set("pageNo", "1")
	q.Set("pageSize", fmt.Sprintf("%d", pageSize))
	q.Set("namespaceId", namespaceID)
	path := "/v1/ns/service/list"
	if c.cfg.V3API {
		path = "/v3/console/ns/service/list"
	}
	body, code, err := c.do(http.MethodGet, path, q, nil)
	if err != nil {
		return nil, err
	}
	if code >= 400 {
		return nil, fmt.Errorf("services/list: HTTP %d: %s", code, truncate(string(body), 200))
	}
	items := parseObjectList(body, "serviceList", "doms", "pageItems", "data")
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		name := firstNonEmpty(strVal(it, "name", "serviceName", "dom"))
		group := firstNonEmpty(strVal(it, "groupName", "group"), "DEFAULT_GROUP")
		if strings.Contains(name, "@@") {
			parts := strings.SplitN(name, "@@", 2)
			group, name = parts[0], parts[1]
		}
		out = append(out, map[string]any{
			"name":         name,
			"groupName":    group,
			"clusterCount": it["clusterCount"],
		})
	}
	// Some Nacos builds return string arrays in serviceList/doms
	if len(out) == 0 {
		var root map[string]any
		_ = json.Unmarshal(body, &root)
		for _, key := range []string{"serviceList", "doms"} {
			if arr, ok := root[key].([]any); ok {
				for _, el := range arr {
					if s, ok := el.(string); ok {
						name, group := s, "DEFAULT_GROUP"
						if strings.Contains(s, "@@") {
							parts := strings.SplitN(s, "@@", 2)
							group, name = parts[0], parts[1]
						}
						out = append(out, map[string]any{"name": name, "groupName": group, "clusterCount": 0})
					}
				}
			}
		}
	}
	total := 0
	totalKnown := false
	var root map[string]any
	_ = json.Unmarshal(body, &root)
	if n := intVal(root, 0, "count", "totalCount", "total"); n > 0 {
		total, totalKnown = n, true
	}
	if !totalKnown {
		total = len(out)
	}
	return map[string]any{
		"services":   out,
		"totalCount": total,
		"pageSize":   pageSize,
		"truncated":  listPossiblyTruncated(len(out), total, pageSize, totalKnown),
	}, nil
}

func (c *NacosClient) InstancesList(serviceName, groupName, namespaceID string) (map[string]any, error) {
	namespaceID = normalizeNamespaceID(namespaceID)
	if groupName == "" {
		groupName = "DEFAULT_GROUP"
	}
	q := url.Values{}
	q.Set("serviceName", serviceName)
	q.Set("groupName", groupName)
	q.Set("namespaceId", namespaceID)
	path := "/v1/ns/instance/list"
	if c.cfg.V3API {
		path = "/v3/console/ns/instance/list"
	}
	body, code, err := c.do(http.MethodGet, path, q, nil)
	if err != nil {
		return nil, err
	}
	if code >= 400 {
		return nil, fmt.Errorf("instances/list: HTTP %d: %s", code, truncate(string(body), 200))
	}
	items := parseObjectList(body, "hosts", "list", "data")
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, map[string]any{
			"ip":          strVal(it, "ip", "ipAddr"),
			"port":        it["port"],
			"healthy":     it["healthy"],
			"weight":      it["weight"],
			"clusterName": strVal(it, "clusterName", "cluster"),
			"serviceName": firstNonEmpty(strVal(it, "serviceName"), serviceName),
			"enabled":     it["enabled"],
			"metadata":    it["metadata"],
		})
	}
	return map[string]any{"instances": out, "totalCount": len(out)}, nil
}

func (c *NacosClient) NamespacesCreate(id, name, desc string) (map[string]any, error) {
	if c.cfg.ReadOnly {
		return nil, fmt.Errorf("read-only mode: namespace create denied")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("namespace name is required")
	}
	id = strings.TrimSpace(id)
	if id == "" {
		id = randomNamespaceID()
	}
	form := url.Values{}
	form.Set("namespaceName", name)
	form.Set("namespaceDesc", desc)
	var path string
	if c.cfg.V3API {
		path = "/v3/console/core/namespace"
		if id != "" {
			form.Set("customNamespaceId", id)
		}
	} else {
		path = "/v1/console/namespaces"
		form.Set("customNamespaceId", id)
	}
	body, code, err := c.do(http.MethodPost, path, nil, form)
	if err != nil {
		return nil, err
	}
	if !writeSucceeded(body, code) {
		return nil, fmt.Errorf("namespaces/create: HTTP %d: %s", code, truncate(string(body), 200))
	}
	return map[string]any{"ok": true, "id": id, "name": name, "desc": desc}, nil
}

func (c *NacosClient) NamespacesUpdate(id, name, desc string) (map[string]any, error) {
	if c.cfg.ReadOnly {
		return nil, fmt.Errorf("read-only mode: namespace update denied")
	}
	id = normalizeNamespaceID(id)
	if id == "" {
		return nil, fmt.Errorf("cannot update public namespace")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("namespace name is required")
	}
	form := url.Values{}
	var path string
	if c.cfg.V3API {
		path = "/v3/console/core/namespace"
		form.Set("namespaceId", id)
		form.Set("namespaceName", name)
		form.Set("namespaceDesc", desc)
	} else {
		path = "/v1/console/namespaces"
		form.Set("namespace", id)
		form.Set("namespaceShowName", name)
		form.Set("namespaceDesc", desc)
	}
	body, code, err := c.do(http.MethodPut, path, nil, form)
	if err != nil {
		return nil, err
	}
	if !writeSucceeded(body, code) {
		return nil, fmt.Errorf("namespaces/update: HTTP %d: %s", code, truncate(string(body), 200))
	}
	return map[string]any{"ok": true, "id": id, "name": name, "desc": desc}, nil
}

func (c *NacosClient) NamespacesDelete(id string) (map[string]any, error) {
	if c.cfg.ReadOnly {
		return nil, fmt.Errorf("read-only mode: namespace delete denied")
	}
	id = normalizeNamespaceID(id)
	if id == "" {
		return nil, fmt.Errorf("cannot delete public namespace")
	}
	q := url.Values{}
	q.Set("namespaceId", id)
	path := "/v1/console/namespaces"
	if c.cfg.V3API {
		path = "/v3/console/core/namespace"
	}
	body, code, err := c.do(http.MethodDelete, path, q, nil)
	if err != nil {
		return nil, err
	}
	if !writeSucceeded(body, code) {
		return nil, fmt.Errorf("namespaces/delete: HTTP %d: %s", code, truncate(string(body), 200))
	}
	return map[string]any{"ok": true, "id": id}, nil
}

func (c *NacosClient) ConfigsHistoryList(dataID, group, namespaceID string, pageSize, pageNo int) (map[string]any, error) {
	namespaceID = normalizeNamespaceID(namespaceID)
	if group == "" {
		group = "DEFAULT_GROUP"
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageNo <= 0 {
		pageNo = 1
	}
	q := url.Values{}
	q.Set("dataId", dataID)
	q.Set("pageNo", fmt.Sprintf("%d", pageNo))
	q.Set("pageSize", fmt.Sprintf("%d", pageSize))
	var path string
	if c.cfg.V3API {
		path = "/v3/console/cs/history/list"
		q.Set("groupName", group)
		q.Set("namespaceId", namespaceID)
	} else {
		path = "/v1/cs/history"
		q.Set("search", "accurate")
		q.Set("group", group)
		q.Set("tenant", namespaceID)
	}
	body, code, err := c.do(http.MethodGet, path, q, nil)
	if err != nil {
		return nil, err
	}
	if code >= 400 {
		return nil, fmt.Errorf("configs/history/list: HTTP %d: %s", code, truncate(string(body), 200))
	}
	items := parseObjectList(body, "pageItems", "data", "histories")
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		id := scrubHistoryID(firstNonEmpty(strVal(it, "id", "nid"), ""))
		nid := scrubHistoryID(firstNonEmpty(strVal(it, "nid", "id"), id))
		ctime := scrubHistoryID(firstNonEmpty(strVal(it, "createdTime", "createTime"), fmt.Sprintf("%v", it["createdTime"])))
		mtime := scrubHistoryID(firstNonEmpty(strVal(it, "lastModifiedTime", "modifyTime"), fmt.Sprintf("%v", it["lastModifiedTime"])))
		out = append(out, map[string]any{
			"id":               id,
			"nid":              nid,
			"dataId":           firstNonEmpty(strVal(it, "dataId"), dataID),
			"group":            firstNonEmpty(strVal(it, "group", "groupName"), group),
			"tenant":           normalizeNamespaceID(firstNonEmpty(strVal(it, "tenant", "namespaceId"), namespaceID)),
			"md5":              strVal(it, "md5"),
			"srcIp":            strVal(it, "srcIp"),
			"srcUser":          strVal(it, "srcUser"),
			"opType":           strVal(it, "opType"),
			"createdTime":      ctime,
			"lastModifiedTime": mtime,
			"content":          strVal(it, "content"),
		})
	}
	total := 0
	totalKnown := false
	var root map[string]any
	_ = json.Unmarshal(body, &root)
	if data := asMap(root["data"]); len(data) > 0 {
		if n := intVal(data, 0, "totalCount", "total"); n > 0 {
			total, totalKnown = n, true
		}
	}
	if !totalKnown {
		if n := intVal(root, 0, "totalCount", "total"); n > 0 {
			total, totalKnown = n, true
		}
	}
	if !totalKnown {
		total = len(out)
	}
	return map[string]any{
		"histories":  out,
		"totalCount": total,
		"truncated":  listPossiblyTruncated(len(out), total, pageSize, totalKnown),
	}, nil
}

func (c *NacosClient) ConfigsHistoryGet(dataID, group, namespaceID, nid string) (map[string]any, error) {
	namespaceID = normalizeNamespaceID(namespaceID)
	if group == "" {
		group = "DEFAULT_GROUP"
	}
	nid = strings.TrimSpace(nid)
	if nid == "" {
		return nil, fmt.Errorf("history id is required")
	}
	q := url.Values{}
	q.Set("dataId", dataID)
	q.Set("nid", nid)
	var path string
	if c.cfg.V3API {
		path = "/v3/console/cs/history"
		q.Set("groupName", group)
		q.Set("namespaceId", namespaceID)
	} else {
		path = "/v1/cs/history"
		q.Set("group", group)
		q.Set("tenant", namespaceID)
	}
	body, code, err := c.do(http.MethodGet, path, q, nil)
	if err != nil {
		return nil, err
	}
	if code >= 400 {
		return nil, fmt.Errorf("configs/history/get: HTTP %d: %s", code, truncate(string(body), 200))
	}
	var asObj map[string]any
	_ = json.Unmarshal(body, &asObj)
	if data := asMap(asObj["data"]); len(data) > 0 {
		asObj = data
	}
	return map[string]any{
		"id":               firstNonEmpty(strVal(asObj, "id", "nid"), nid),
		"nid":              firstNonEmpty(strVal(asObj, "nid", "id"), nid),
		"dataId":           firstNonEmpty(strVal(asObj, "dataId"), dataID),
		"group":            firstNonEmpty(strVal(asObj, "group", "groupName"), group),
		"tenant":           normalizeNamespaceID(firstNonEmpty(strVal(asObj, "tenant", "namespaceId"), namespaceID)),
		"content":          strVal(asObj, "content"),
		"md5":              strVal(asObj, "md5"),
		"type":             strVal(asObj, "type"),
		"srcIp":            strVal(asObj, "srcIp"),
		"srcUser":          strVal(asObj, "srcUser"),
		"opType":           strVal(asObj, "opType"),
		"createdTime":      strVal(asObj, "createdTime", "createTime"),
		"lastModifiedTime": strVal(asObj, "lastModifiedTime", "modifyTime"),
	}, nil
}

func writeSucceeded(body []byte, code int) bool {
	return publishSucceeded(body, code)
}

func randomNamespaceID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("ns-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

func parseObjectList(body []byte, keys ...string) []map[string]any {
	var raw any
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil
	}
	if arr, ok := raw.([]any); ok {
		return toObjSlice(arr)
	}
	root := asMap(raw)
	for _, k := range keys {
		if v, ok := root[k]; ok {
			switch t := v.(type) {
			case []any:
				return toObjSlice(t)
			case map[string]any:
				for _, nested := range []string{"pageItems", "list", "data", "hosts"} {
					if arr, ok := t[nested].([]any); ok {
						return toObjSlice(arr)
					}
				}
			}
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

/** listPossiblyTruncated: known total>loaded, or unknown total with a full page. */
func listPossiblyTruncated(loaded, total, pageSize int, totalKnown bool) bool {
	if totalKnown && total > loaded {
		return true
	}
	return !totalKnown && loaded >= pageSize && pageSize > 0
}

func scrubHistoryID(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || s == "<nil>" || s == "null" || s == "map[]" {
		return ""
	}
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
