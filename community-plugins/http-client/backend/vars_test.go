package main

import (
	"strings"
	"testing"
)

func TestTruncateRunes(t *testing.T) {
	if got := truncateRunes("abcdef", 3); got != "abc…" {
		t.Fatalf("got %q", got)
	}
	if got := truncateRunes("ab", 3); got != "ab" {
		t.Fatalf("short got %q", got)
	}
}

func TestResolveVarsDynamicAndEnv(t *testing.T) {
	vars := map[string]string{"token": "abc", "tenant": "t1"}
	out := resolveVars("Bearer {{token}} / {{tenant}} / round={{$round}}", vars, 3)
	if out != "Bearer abc / t1 / round=3" {
		t.Fatalf("unexpected: %q", out)
	}
	if got := resolveVars("{{missing}}", vars, 1); got != "{{missing}}" {
		t.Fatalf("missing var should stay: %q", got)
	}
}

func TestRunScriptSetsEnv(t *testing.T) {
	vars := map[string]string{}
	result := runScript(`pm.environment.set("token", "bearer xyz");`, vars, nil, nil)
	if !result.OK || result.Error != "" {
		t.Fatalf("script failed: %+v", result)
	}
	if vars["token"] != "bearer xyz" {
		t.Fatalf("token not set: %#v", vars)
	}
}

func TestRunScriptPostExtract(t *testing.T) {
	vars := map[string]string{}
	result := runScript(`
var data = pm.response.json();
pm.environment.set("token", data.data);
`, vars, &scriptResponse{
		Status:   200,
		BodyText: `{"status":200,"data":"bearer hello"}`,
	}, nil)
	if !result.OK || result.Error != "" {
		t.Fatalf("script failed: %+v", result)
	}
	if vars["token"] != "bearer hello" {
		t.Fatalf("token=%q", vars["token"])
	}
}

func TestRunScriptAllowsTopLevelReturn(t *testing.T) {
	vars := map[string]string{}
	result := runScript(`
pm.environment.set("token", "ok");
return;
`, vars, nil, nil)
	if !result.OK || result.Error != "" {
		t.Fatalf("top-level return should be allowed: %+v", result)
	}
	if vars["token"] != "ok" {
		t.Fatalf("token=%q", vars["token"])
	}
}

func TestRunScriptMutatesRequestBody(t *testing.T) {
	vars := map[string]string{"batch": "b1"}
	req := &scriptRequestMut{
		Method:   "POST",
		URL:      "http://example/contents/t",
		BodyMode: "raw",
		BodyRaw:  "{}",
	}
	result := runScript(`
var payload = { type: "fact", pks: ["id"], records: [{ id: "1", batch_no: pm.environment.get("batch"), t: Date.now() }] };
pm.request.body.update(payload);
pm.request.headers.set("X-Demo", "1");
`, vars, nil, req)
	if !result.OK || result.Error != "" {
		t.Fatalf("script failed: %+v", result)
	}
	if !req.Dirty || !strings.Contains(req.BodyRaw, `"batch_no":"b1"`) {
		t.Fatalf("body not updated: dirty=%v raw=%q", req.Dirty, req.BodyRaw)
	}
	found := false
	for _, header := range req.Headers {
		if header.Key == "X-Demo" && header.Value == "1" {
			found = true
		}
	}
	if !found {
		t.Fatalf("header missing: %+v", req.Headers)
	}
}
