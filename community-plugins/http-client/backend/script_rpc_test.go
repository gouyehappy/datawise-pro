package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/datawise/community-plugin-http-client/internal/rpc"
)

func okResult(body string) *sendResult {
	return &sendResult{
		OK:                true,
		Status:            http.StatusOK,
		StatusText:        "OK",
		BodyPreviewBase64: base64.StdEncoding.EncodeToString([]byte(body)),
		Headers:           []headerOut{{Key: "Content-Type", Value: "application/json"}},
	}
}

// --- script/run RPC 参数解析 ----------------------------------------------

func TestHandleScriptRunPostScriptParams(t *testing.T) {
	p := &plugin{executor: newExecutor()}
	raw := json.RawMessage(`{
		"code": "pm.environment.set(\"token\", pm.response.json().token); console.log(\"hello\"); pm.test(\"status\", function () { pm.expect(pm.response.code).to.eql(200); });",
		"vars": {"a": "1"},
		"response": {"status": 200, "statusText": "OK", "durationMs": 12, "headers": {"content-type": "application/json"}, "bodyText": "{\"token\":\"xyz\"}"},
		"request": null
	}`)
	got, rpcErr := p.Handle(rpc.RequestContext{}, "script/run", raw, rpc.DiscardEmitter())
	if rpcErr != nil {
		t.Fatalf("script/run failed: %+v", rpcErr)
	}
	out, ok := got.(*scriptRunResult)
	if !ok {
		t.Fatalf("unexpected result type %T", got)
	}
	if !out.OK || out.Error != "" {
		t.Fatalf("script failed: %+v", out)
	}
	if out.Vars["a"] != "1" || out.Vars["token"] != "xyz" {
		t.Fatalf("vars not merged/mutated: %#v", out.Vars)
	}
	if !out.Dirty || out.ReqDirty {
		t.Fatalf("dirty=%v reqDirty=%v", out.Dirty, out.ReqDirty)
	}
	if len(out.Logs) != 1 || out.Logs[0] != "hello" {
		t.Fatalf("logs=%#v", out.Logs)
	}
	if len(out.Tests) != 1 || !out.Tests[0].OK || out.Tests[0].Name != "status" {
		t.Fatalf("tests=%#v", out.Tests)
	}
	if out.Request != nil {
		t.Fatalf("post-script must return a null request, got %#v", out.Request)
	}
	if out.DurationMs < 0 {
		t.Fatalf("negative durationMs: %d", out.DurationMs)
	}

	encoded, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	var shape map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &shape); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"ok", "error", "logs", "tests", "dirty", "durationMs", "reqDirty", "vars", "request"} {
		if _, present := shape[key]; !present {
			t.Fatalf("missing result key %q in %s", key, encoded)
		}
	}
}

func TestHandleScriptRunPreScriptMutatesRequest(t *testing.T) {
	p := &plugin{executor: newExecutor()}
	raw := json.RawMessage(`{
		"code": "pm.request.method = \"post\"; pm.request.url = \"https://example.com/v2\"; pm.request.headers.set(\"X-Token\", \"t\"); pm.request.body.update({a:1}); pm.request.auth.token = \"new\";",
		"vars": {},
		"response": null,
		"request": {"method":"GET","url":"https://example.com/v1","headers":[{"key":"A","value":"1","enabled":true}],"bodyMode":"raw","bodyRaw":"{}","bodyContentType":"application/json","auth":{"type":"bearer","token":"old","username":"u","password":"p","key":"k","value":"v","in":"query"}}
	}`)
	got, rpcErr := p.Handle(rpc.RequestContext{}, "script/run", raw, rpc.DiscardEmitter())
	if rpcErr != nil {
		t.Fatalf("script/run failed: %+v", rpcErr)
	}
	out := got.(*scriptRunResult)
	if !out.OK || out.Error != "" {
		t.Fatalf("script failed: %+v", out)
	}
	if !out.ReqDirty || out.Dirty {
		t.Fatalf("dirty=%v reqDirty=%v", out.Dirty, out.ReqDirty)
	}
	req := out.Request
	if req == nil {
		t.Fatal("pre-script must echo the request")
	}
	if req.Method != "POST" || req.URL != "https://example.com/v2" {
		t.Fatalf("method/url not mutated: %q %q", req.Method, req.URL)
	}
	if req.BodyMode != "raw" || !strings.Contains(req.BodyRaw, `"a":1`) || req.BodyContentType != "application/json" {
		t.Fatalf("body not mutated: %#v", req)
	}
	var headerA, headerX bool
	for _, row := range req.Headers {
		if row.Key == "A" && row.Value == "1" {
			headerA = true
		}
		if row.Key == "X-Token" && row.Value == "t" {
			headerX = true
		}
	}
	if !headerA || !headerX {
		t.Fatalf("headers not preserved/extended: %#v", req.Headers)
	}
	// Auth fields that the script cannot touch must still round-trip unchanged.
	if req.Auth.Type != "bearer" || req.Auth.Token != "new" ||
		req.Auth.Username != "u" || req.Auth.Password != "p" ||
		req.Auth.Key != "k" || req.Auth.Value != "v" || req.Auth.In != "query" {
		t.Fatalf("auth not round-tripped: %#v", req.Auth)
	}
	if out.Vars == nil || len(out.Vars) != 0 {
		t.Fatalf("vars should be an empty object, got %#v", out.Vars)
	}
}

func TestHandleScriptRunInvalidParams(t *testing.T) {
	p := &plugin{executor: newExecutor()}
	for _, bad := range []json.RawMessage{
		json.RawMessage("null"),
		json.RawMessage("{"),
		json.RawMessage("[]"),
	} {
		_, rpcErr := p.Handle(rpc.RequestContext{}, "script/run", bad, rpc.DiscardEmitter())
		if rpcErr == nil || rpcErr.Code != -32602 {
			t.Fatalf("params %s: expected -32602, got %+v", bad, rpcErr)
		}
	}

	// Empty code is a no-op but still returns the full result shape.
	got, rpcErr := p.Handle(rpc.RequestContext{}, "script/run",
		json.RawMessage(`{"code":"","vars":{"a":"1"}}`), rpc.DiscardEmitter())
	if rpcErr != nil {
		t.Fatalf("empty code: %+v", rpcErr)
	}
	out := got.(*scriptRunResult)
	if !out.OK || out.Dirty || out.ReqDirty || out.Vars["a"] != "1" || out.Request != nil {
		t.Fatalf("unexpected empty-code result: %+v", out)
	}
	if out.Logs == nil || out.Tests == nil {
		t.Fatal("logs/tests must be arrays, not null")
	}
}

// --- pm.sendRequest --------------------------------------------------------

func TestSendRequestUnavailableInWorkflowScripts(t *testing.T) {
	result := runScript(`pm.sendRequest("http://example.com")`, map[string]string{}, nil, nil)
	if result.OK || !strings.Contains(result.Error, "pm.sendRequest is only available in single-request scripts") {
		t.Fatalf("expected explicit error, got %+v", result)
	}
}

func TestSendRequestSpecAndResponseShape(t *testing.T) {
	var specs []*sendRequest
	sender := func(spec *sendRequest) *sendResult {
		specs = append(specs, spec)
		return okResult(`{"token":"abc"}`)
	}
	vars := map[string]string{}
	result := runScriptWithSender(`
var r = pm.sendRequest({method:"post", url:"https://example.com/token", headers:{"X-A":"1"}, body:{user:"u"}, timeoutMs:999999});
pm.environment.set("code", r.code);
pm.environment.set("status", r.status);
pm.environment.set("ok", r.ok);
pm.environment.set("token", r.json().token);
pm.environment.set("text", r.text());
pm.environment.set("ct", r.headers["content-type"]);
var s = pm.sendRequest("http://example.com/ping");
pm.environment.set("scode", s.code);
`, vars, nil, nil, sender)
	if !result.OK || result.Error != "" {
		t.Fatalf("script failed: %+v", result)
	}
	want := map[string]string{
		"code": "200", "status": "OK", "ok": "true", "token": "abc",
		"text": `{"token":"abc"}`, "ct": "application/json", "scode": "200",
	}
	for key, value := range want {
		if vars[key] != value {
			t.Fatalf("vars[%q]=%q want %q", key, vars[key], value)
		}
	}
	if len(specs) != 2 {
		t.Fatalf("expected 2 sub-requests, got %d", len(specs))
	}
	first := specs[0]
	if first.Method != "POST" || first.URL != "https://example.com/token" || first.RequestID == "" {
		t.Fatalf("object spec not parsed: %#v", first)
	}
	if first.Body.Mode != "raw" || first.Body.Raw != `{"user":"u"}` || first.Body.ContentType != "application/json" {
		t.Fatalf("body not parsed: %#v", first.Body)
	}
	foundHeader := false
	for _, row := range first.Headers {
		if row.Key == "X-A" && row.Value == "1" {
			foundHeader = true
		}
	}
	if !foundHeader {
		t.Fatalf("headers not parsed: %#v", first.Headers)
	}
	for _, spec := range specs {
		if spec.Options.TimeoutMs != sendRequestTimeoutMs {
			t.Fatalf("timeout not pinned to 10s: %d", spec.Options.TimeoutMs)
		}
		if spec.Options.ProgressEvents || spec.Options.RetryCount != 0 || spec.Options.RetryOnNetwork {
			t.Fatalf("progress/retry must stay off: %#v", spec.Options)
		}
	}
	if specs[1].Method != "GET" || specs[1].URL != "http://example.com/ping" {
		t.Fatalf("string spec not parsed: %#v", specs[1])
	}
}

func TestSendRequestRejectsNonHTTPURLs(t *testing.T) {
	called := 0
	sender := func(*sendRequest) *sendResult {
		called++
		return okResult("{}")
	}
	for _, bad := range []string{
		"file:///etc/passwd", "ftp://example.com/a", "example.com/a", "", "javascript:alert(1)",
	} {
		code := fmt.Sprintf(`pm.sendRequest(%q)`, bad)
		result := runScriptWithSender(code, map[string]string{}, nil, nil, sender)
		if result.OK || !strings.Contains(result.Error, "only http/https URLs are allowed") {
			t.Fatalf("url %q: expected scheme rejection, got %+v", bad, result)
		}
	}
	if called != 0 {
		t.Fatalf("sender must not be called for rejected URLs, got %d", called)
	}
}

func TestSendRequestCallLimit(t *testing.T) {
	calls := 0
	limiter := &sendRequestLimiter{depth: 1, sender: func(*sendRequest) *sendResult {
		calls++
		return okResult("{}")
	}}
	result := runScriptWithLimiter(`
for (var i = 0; i < 8; i++) { pm.sendRequest("http://example.com/" + i); }
`, map[string]string{}, nil, nil, limiter)
	if result.OK || !strings.Contains(result.Error, "5 calls per script") {
		t.Fatalf("expected call-limit error, got %+v", result)
	}
	if calls != sendRequestMaxCalls {
		t.Fatalf("expected exactly %d sub-requests, got %d", sendRequestMaxCalls, calls)
	}
}

func TestSendRequestDepthLimit(t *testing.T) {
	// A sender that runs a child script with the SAME limiter simulates a
	// chained sub-request script. Depth must stop the chain after 3 hops.
	limiter := &sendRequestLimiter{depth: 1}
	var deepestError string
	limiter.sender = func(*sendRequest) *sendResult {
		child := runScriptWithLimiter(`pm.sendRequest("http://example.com/next")`,
			map[string]string{}, nil, nil, limiter)
		if child.Error != "" && deepestError == "" {
			deepestError = child.Error
		}
		return okResult("{}")
	}
	top := runScriptWithLimiter(`pm.sendRequest("http://example.com/start")`,
		map[string]string{}, nil, nil, limiter)
	if !top.OK || top.Error != "" {
		t.Fatalf("top-level script should finish: %+v", top)
	}
	if !strings.Contains(deepestError, "maximum nesting depth of 3") {
		t.Fatalf("expected depth error, got %q", deepestError)
	}
	if limiter.calls != sendRequestMaxDepth {
		t.Fatalf("expected exactly %d chained calls, got %d", sendRequestMaxDepth, limiter.calls)
	}
}

func TestSendRequestSlowSubRequestDoesNotTripScriptWatchdog(t *testing.T) {
	// The 2 s watchdog must budget JS time only: a sub-request may take up to
	// 10 s and must not abort the script as soon as JS resumes.
	sender := func(*sendRequest) *sendResult {
		time.Sleep(2100 * time.Millisecond)
		return okResult("{}")
	}
	result := runScriptWithSender(`
pm.sendRequest("http://example.com/slow");
pm.environment.set("done", "yes");
`, map[string]string{}, nil, nil, sender)
	if !result.OK || result.Error != "" {
		t.Fatalf("slow sub-request must not abort the script: %+v", result)
	}
}

func TestSendRequestTransportFailureThrows(t *testing.T) {
	sender := func(*sendRequest) *sendResult {
		return &sendResult{Error: &requestError{Kind: "network", Message: "connection refused"}}
	}
	result := runScriptWithSender(`pm.sendRequest("http://example.com")`,
		map[string]string{}, nil, nil, sender)
	if result.OK || !strings.Contains(result.Error, "connection refused") {
		t.Fatalf("expected transport error to surface, got %+v", result)
	}
}

func TestSendRequestOkFlagIsHTTPStatus(t *testing.T) {
	for status, want := range map[int]string{
		http.StatusOK: "true", http.StatusNotFound: "false", http.StatusInternalServerError: "false",
	} {
		current := status
		sender := func(*sendRequest) *sendResult {
			return &sendResult{OK: true, Status: current, StatusText: "x"}
		}
		vars := map[string]string{}
		result := runScriptWithSender(
			`pm.environment.set("ok", pm.sendRequest("http://example.com").ok);`,
			vars, nil, nil, sender)
		if !result.OK || result.Error != "" {
			t.Fatalf("status %d: script failed: %+v", current, result)
		}
		if vars["ok"] != want {
			t.Fatalf("status %d: ok=%q want %q", current, vars["ok"], want)
		}
	}
}

// --- 端到端：真实 executor + 无 progress 事件 ------------------------------

type frameWriter struct{ lines chan string }

func (w *frameWriter) Write(p []byte) (int, error) {
	select {
	case w.lines <- string(p):
	default:
	}
	return len(p), nil
}

func TestScriptRunSendRequestEndToEndNoProgress(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"token":"abc"}`))
	}))
	defer server.Close()

	p := &plugin{executor: newExecutor()}
	payload := scriptRunParams{
		Code: fmt.Sprintf(`pm.environment.set("token", pm.sendRequest(%q).json().token);`, server.URL),
		Vars: map[string]string{},
	}
	params, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	frame := fmt.Sprintf(`{"jsonrpc":"2.0","id":7,"method":"script/run","params":%s}`, params) + "\n"

	writer := &frameWriter{lines: make(chan string, 32)}
	if err := rpc.NewServer(rpc.Metadata{}, p).ServeIO(strings.NewReader(frame), writer); err != nil {
		t.Fatal(err)
	}

	deadline := time.After(10 * time.Second)
	seen := []string{}
	for {
		select {
		case line := <-writer.lines:
			seen = append(seen, line)
			if strings.Contains(line, `"result"`) {
				goto done
			}
		case <-deadline:
			t.Fatal("timed out waiting for script/run response")
		}
	}
done:
	joined := strings.Join(seen, "")
	for _, line := range seen {
		if strings.Contains(line, "http/progress") {
			t.Fatalf("chained request must not emit progress events: %s", line)
		}
	}
	if !strings.Contains(joined, `"token":"abc"`) {
		t.Fatalf("token was not extracted from the sub-request: %s", joined)
	}
}
