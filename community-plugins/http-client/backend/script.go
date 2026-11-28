package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"sync/atomic"
	"time"

	"github.com/datawise/community-plugin-http-client/internal/rpc"
	"github.com/dop251/goja"
)

type scriptTest struct {
	Name    string `json:"name"`
	OK      bool   `json:"ok"`
	Message string `json:"message,omitempty"`
}

type scriptResult struct {
	OK         bool         `json:"ok"`
	Error      string       `json:"error,omitempty"`
	Logs       []string     `json:"logs,omitempty"`
	Tests      []scriptTest `json:"tests,omitempty"`
	Dirty      bool         `json:"dirty"`
	DurationMs int64        `json:"durationMs"`
	ReqDirty   bool         `json:"reqDirty"`
}

// scriptTimeout bounds both UI-visible loops and Go-side goja execution.
// A runaway script must never block the single workflow goroutine forever.
const scriptTimeout = 2 * time.Second

const (
	// pm.sendRequest is deliberately restricted: at most 3 nested hops in a
	// request chain, at most 5 calls in one script run, and a fixed 10 s cap
	// on every sub-request regardless of what the script asks for.
	sendRequestMaxDepth  = 3
	sendRequestMaxCalls  = 5
	sendRequestTimeoutMs = 10000
)

// scriptRequestSeq keeps sub-request IDs unique across concurrent script/run
// RPCs so executor.inflight bookkeeping can never cancel the wrong request.
var scriptRequestSeq atomic.Uint64

func nowMs() int64 {
	return time.Now().UnixMilli()
}

type scriptResponse struct {
	Status     int
	StatusText string
	DurationMs int64
	Headers    map[string]string
	BodyText   string
}

// scriptRequestMut is the mutable request surface exposed to pre-scripts.
type scriptRequestMut struct {
	Method          string
	URL             string
	Headers         []headerPair
	BodyMode        string
	BodyRaw         string
	BodyContentType string
	AuthType        string
	AuthToken       string
	AuthUsername    string
	AuthPassword    string
	AuthKey         string
	AuthValue       string
	AuthIn          string
	Dirty           bool
	URLDirty        bool
}

// scriptRunParams mirrors the single-request script payload sent by the UI.
// The wire names are identical to the UI request shape so the returned
// request can be consumed verbatim after the run.
type scriptRunParams struct {
	Code     string             `json:"code"`
	Vars     map[string]string  `json:"vars"`
	Response *scriptRunResponse `json:"response"`
	Request  *scriptRunRequest  `json:"request"`
}

type scriptRunResponse struct {
	Status     int               `json:"status"`
	StatusText string            `json:"statusText"`
	DurationMs int64             `json:"durationMs"`
	Headers    map[string]string `json:"headers"`
	BodyText   string            `json:"bodyText"`
}

type scriptRunRequest struct {
	Method          string       `json:"method"`
	URL             string       `json:"url"`
	Headers         []headerPair `json:"headers"`
	BodyMode        string       `json:"bodyMode"`
	BodyRaw         string       `json:"bodyRaw"`
	BodyContentType string       `json:"bodyContentType"`
	Auth            authConfig   `json:"auth"`
}

type scriptRunResult struct {
	OK         bool              `json:"ok"`
	Error      string            `json:"error"`
	Logs       []string          `json:"logs"`
	Tests      []scriptTest      `json:"tests"`
	Dirty      bool              `json:"dirty"`
	DurationMs int64             `json:"durationMs"`
	ReqDirty   bool              `json:"reqDirty"`
	Vars       map[string]string `json:"vars"`
	Request    *scriptRunRequest `json:"request"`
}

func (r *scriptRunRequest) toMut() *scriptRequestMut {
	if r == nil {
		return nil
	}
	headers := make([]headerPair, len(r.Headers))
	copy(headers, r.Headers)
	return &scriptRequestMut{
		Method:          r.Method,
		URL:             r.URL,
		Headers:         headers,
		BodyMode:        r.BodyMode,
		BodyRaw:         r.BodyRaw,
		BodyContentType: r.BodyContentType,
		AuthType:        r.Auth.Type,
		AuthToken:       r.Auth.Token,
		AuthUsername:    r.Auth.Username,
		AuthPassword:    r.Auth.Password,
		AuthKey:         r.Auth.Key,
		AuthValue:       r.Auth.Value,
		AuthIn:          r.Auth.In,
	}
}

func mutToScriptRunRequest(m *scriptRequestMut) *scriptRunRequest {
	if m == nil {
		return nil
	}
	headers := make([]headerPair, len(m.Headers))
	copy(headers, m.Headers)
	return &scriptRunRequest{
		Method:          m.Method,
		URL:             m.URL,
		Headers:         headers,
		BodyMode:        m.BodyMode,
		BodyRaw:         m.BodyRaw,
		BodyContentType: m.BodyContentType,
		Auth: authConfig{
			Type:     m.AuthType,
			Username: m.AuthUsername,
			Password: m.AuthPassword,
			Token:    m.AuthToken,
			Key:      m.AuthKey,
			Value:    m.AuthValue,
			In:       m.AuthIn,
		},
	}
}

// handleScriptRun is the script/run RPC: it moves single-request pre/post
// scripts out of the UI's new Function into the goja sandbox. A non-nil
// request means pre-script (pm.request may mutate it); a null request means
// post-script. The sender is only wired here, never for workflow scripts.
func (p *plugin) handleScriptRun(params json.RawMessage) (any, *rpc.PluginError) {
	var payload scriptRunParams
	if pluginErr := decodeParams(params, &payload); pluginErr != nil {
		return nil, pluginErr
	}
	if payload.Vars == nil {
		payload.Vars = map[string]string{}
	}

	var resp *scriptResponse
	if r := payload.Response; r != nil {
		headers := r.Headers
		if headers == nil {
			headers = map[string]string{}
		}
		resp = &scriptResponse{
			Status:     r.Status,
			StatusText: r.StatusText,
			DurationMs: r.DurationMs,
			Headers:    headers,
			BodyText:   r.BodyText,
		}
	}

	mut := payload.Request.toMut()
	var sender func(*sendRequest) *sendResult
	if p.executor != nil {
		sender = func(spec *sendRequest) *sendResult {
			// Chained requests must stay quiet: no progress notifications, no
			// retries (both are also pinned in parseSendSpec).
			return p.executor.execute(spec, rpc.DiscardEmitter())
		}
	}
	result := runScriptWithSender(payload.Code, payload.Vars, resp, mut, sender)

	logs := result.Logs
	if logs == nil {
		logs = []string{}
	}
	tests := result.Tests
	if tests == nil {
		tests = []scriptTest{}
	}
	return &scriptRunResult{
		OK:         result.OK,
		Error:      result.Error,
		Logs:       logs,
		Tests:      tests,
		Dirty:      result.Dirty,
		DurationMs: result.DurationMs,
		ReqDirty:   result.ReqDirty,
		Vars:       payload.Vars,
		Request:    mutToScriptRunRequest(mut),
	}, nil
}

func stepToMut(step workflowStep, vars map[string]string, round int) *scriptRequestMut {
	resolve := func(value string) string { return resolveVars(value, vars, round) }
	headers := make([]headerPair, 0, len(step.Headers))
	for _, row := range step.Headers {
		if !row.active() {
			continue
		}
		enabled := true
		headers = append(headers, headerPair{
			Key:     resolve(row.Key),
			Value:   resolve(row.Value),
			Enabled: &enabled,
		})
	}
	return &scriptRequestMut{
		Method:          strings.ToUpper(strings.TrimSpace(step.Method)),
		URL:             resolve(step.URL),
		Headers:         headers,
		BodyMode:        step.Body.Mode,
		BodyRaw:         resolve(step.Body.Raw),
		BodyContentType: resolve(step.Body.ContentType),
		AuthType:        step.Auth.Type,
		AuthToken:       resolve(step.Auth.Token),
		AuthUsername:    resolve(step.Auth.Username),
		AuthPassword:    resolve(step.Auth.Password),
		AuthKey:         resolve(step.Auth.Key),
		AuthValue:       resolve(step.Auth.Value),
		AuthIn:          step.Auth.In,
	}
}

func applyMutToStep(step *workflowStep, mut *scriptRequestMut) {
	if step == nil || mut == nil || !mut.Dirty {
		return
	}
	if mut.Method != "" {
		step.Method = mut.Method
	}
	step.URL = mut.URL
	step.Headers = mut.Headers
	if mut.BodyMode != "" {
		step.Body.Mode = mut.BodyMode
	}
	step.Body.Raw = mut.BodyRaw
	if mut.BodyContentType != "" {
		step.Body.ContentType = mut.BodyContentType
	}
	if mut.BodyRaw != "" && (step.Body.Mode == "" || step.Body.Mode == "none") {
		step.Body.Mode = "raw"
	}
	if mut.AuthType != "" {
		step.Auth.Type = mut.AuthType
	}
	step.Auth.Token = mut.AuthToken
	step.Auth.Username = mut.AuthUsername
	step.Auth.Password = mut.AuthPassword
	step.Auth.Key = mut.AuthKey
	step.Auth.Value = mut.AuthValue
	if mut.AuthIn != "" {
		step.Auth.In = mut.AuthIn
	}
	if mut.URLDirty {
		// Script supplied a concrete URL; do not rebuild query/path from stale rows.
		step.Params = nil
		step.PathParams = nil
	}
}

// runScript executes a Postman/ApiPost-lite pre/post script against vars.
// When req is non-nil (pre-script), pm.request can mutate method/url/headers/body/auth.
// Workflow scripts have no sender, so pm.sendRequest reports a clear error there.
func runScript(code string, vars map[string]string, resp *scriptResponse, req *scriptRequestMut) scriptResult {
	return runScriptWithSender(code, vars, resp, req, nil)
}

// runScriptWithSender is runScript with an optional pm.sendRequest executor.
// Only single-request scripts (script/run) get a real sender; nested script
// runs in one chain share a limiter through runScriptWithLimiter.
func runScriptWithSender(code string, vars map[string]string, resp *scriptResponse, req *scriptRequestMut, sender func(*sendRequest) *sendResult) scriptResult {
	return runScriptWithLimiter(code, vars, resp, req, &sendRequestLimiter{sender: sender, depth: 1})
}

// named result so the deferred duration stamp is part of the returned value.
func runScriptWithLimiter(code string, vars map[string]string, resp *scriptResponse, req *scriptRequestMut, limiter *sendRequestLimiter) (result scriptResult) {
	source := strings.TrimSpace(code)
	result = scriptResult{OK: true}
	if source == "" {
		return result
	}
	started := nowMs()
	defer func() {
		result.DurationMs = nowMs() - started
	}()

	vm := goja.New()
	// The 2 s watchdog budgets JS execution only: while pm.sendRequest blocks
	// on Go-side I/O the VM is idle, so re-arm instead of interrupting (a
	// sub-request may legitimately take up to 10 s).
	var timer *time.Timer
	timer = time.AfterFunc(scriptTimeout, func() {
		if limiter != nil && limiter.inIO.Load() > 0 {
			timer.Reset(scriptTimeout)
			return
		}
		vm.Interrupt("script execution timed out after " + scriptTimeout.String())
	})
	defer timer.Stop()
	logs := []string{}
	dirty := false
	removed := map[string]bool{}

	envGet := func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		if value, ok := vars[key]; ok {
			return vm.ToValue(value)
		}
		return goja.Undefined()
	}
	envSet := func(call goja.FunctionCall) goja.Value {
		key := strings.TrimSpace(call.Argument(0).String())
		if key == "" {
			return goja.Undefined()
		}
		value := ""
		if !goja.IsUndefined(call.Argument(1)) && !goja.IsNull(call.Argument(1)) {
			value = call.Argument(1).String()
		}
		delete(removed, key)
		vars[key] = value
		dirty = true
		return goja.Undefined()
	}
	envUnset := func(call goja.FunctionCall) goja.Value {
		key := strings.TrimSpace(call.Argument(0).String())
		if key == "" {
			return goja.Undefined()
		}
		delete(vars, key)
		removed[key] = true
		dirty = true
		return goja.Undefined()
	}

	envObj := vm.NewObject()
	_ = envObj.Set("get", envGet)
	_ = envObj.Set("set", envSet)
	_ = envObj.Set("unset", envUnset)

	pm := vm.NewObject()
	_ = pm.Set("environment", envObj)
	_ = pm.Set("variables", envObj)
	_ = pm.Set("globals", envObj)

	if req != nil {
		attachRequestAPI(vm, pm, req)
	}

	status := 0
	statusText := ""
	durationMs := int64(0)
	bodyText := ""
	headerMap := map[string]string{}
	if resp != nil {
		status = resp.Status
		statusText = resp.StatusText
		durationMs = resp.DurationMs
		bodyText = resp.BodyText
		headerMap = resp.Headers
		if headerMap == nil {
			headerMap = map[string]string{}
		}
	}

	responseObj := vm.NewObject()
	_ = responseObj.Set("code", status)
	_ = responseObj.Set("status", statusText)
	_ = responseObj.Set("responseTime", durationMs)
	_ = responseObj.Set("headers", headerMap)
	_ = responseObj.Set("text", func(goja.FunctionCall) goja.Value {
		return vm.ToValue(bodyText)
	})
	_ = responseObj.Set("json", func(goja.FunctionCall) goja.Value {
		var parsed any
		if err := json.Unmarshal([]byte(bodyText), &parsed); err != nil {
			panic(vm.ToValue("response body is not JSON: " + err.Error()))
		}
		return vm.ToValue(parsed)
	})
	_ = pm.Set("response", responseObj)

	_ = pm.Set("test", func(call goja.FunctionCall) goja.Value {
		name := strings.TrimSpace(call.Argument(0).String())
		if name == "" {
			name = "test"
		}
		fn, ok := goja.AssertFunction(call.Argument(1))
		if !ok {
			return goja.Undefined()
		}
		test := scriptTest{Name: name, OK: true}
		if _, err := fn(goja.Undefined()); err != nil {
			test.OK = false
			test.Message = err.Error()
			result.OK = false
			logs = append(logs, "test failed: "+name+": "+err.Error())
		}
		result.Tests = append(result.Tests, test)
		return goja.Undefined()
	})

	consoleObj := vm.NewObject()
	logFn := func(call goja.FunctionCall) goja.Value {
		parts := make([]string, 0, len(call.Arguments))
		for _, arg := range call.Arguments {
			parts = append(parts, fmt.Sprint(arg.Export()))
		}
		logs = append(logs, strings.Join(parts, " "))
		return goja.Undefined()
	}
	_ = consoleObj.Set("log", logFn)
	_ = consoleObj.Set("info", logFn)
	_ = consoleObj.Set("warn", logFn)
	_ = consoleObj.Set("error", logFn)

	responseCode := vm.NewObject()
	_ = responseCode.Set("code", status)
	_ = responseCode.Set("name", statusText)
	_ = responseCode.Set("detail", statusText)

	_ = vm.Set("pm", pm)
	_ = vm.Set("apt", pm)
	_ = vm.Set("console", consoleObj)
	_ = vm.Set("responseBody", bodyText)
	_ = vm.Set("responseHeaders", headerMap)
	_ = vm.Set("responseCode", responseCode)

	compat := vm.NewObject()
	var parsedJSON any
	if err := json.Unmarshal([]byte(bodyText), &parsedJSON); err == nil {
		_ = compat.Set("json", parsedJSON)
	} else {
		_ = compat.Set("json", nil)
	}
	rawObj := vm.NewObject()
	_ = rawObj.Set("status", status)
	_ = rawObj.Set("responseTime", durationMs)
	_ = rawObj.Set("responseText", bodyText)
	_ = rawObj.Set("type", "json")
	_ = compat.Set("raw", rawObj)
	_ = compat.Set("headers", headerMap)
	_ = vm.Set("response", compat)

	// pm.expect / pm.assert mirror the UI sandbox so imported scripts behave
	// the same in single-request mode and inside workflow runs.
	attachAssertionAPI(vm, pm, &result, &logs)

	// pm.sendRequest is only backed by a real executor for single-request
	// scripts; with a nil sender it throws an explicit error.
	attachSendRequestAPI(vm, pm, limiter)

	// Wrap like Postman/UI `new Function(...)` so top-level `return` is legal.
	wrapped := "(function () {\n" + source + "\n})()"
	if _, err := vm.RunString(wrapped); err != nil {
		result.OK = false
		result.Error = err.Error()
	}
	result.Logs = logs
	result.Dirty = dirty
	if req != nil {
		result.ReqDirty = req.Dirty
	}
	return result
}

// attachAssertionAPI provides pm.expect / pm.assert with the same small surface
// as the UI runner (to.eql / to.equal / to.deeply.eql / a / ok).
func attachAssertionAPI(vm *goja.Runtime, pm *goja.Object, result *scriptResult, logs *[]string) {
	fail := func(message string) { panic(vm.ToValue(message)) }
	fmtValue := func(v any) string {
		raw, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprint(v)
		}
		return string(raw)
	}
	same := func(a, b any) bool {
		aJSON, aErr := json.Marshal(a)
		bJSON, bErr := json.Marshal(b)
		if aErr == nil && bErr == nil && string(aJSON) == string(bJSON) {
			return true
		}
		return fmt.Sprint(a) == fmt.Sprint(b)
	}

	expect := func(call goja.FunctionCall) goja.Value {
		actual := call.Argument(0)
		exported := actual.Export()
		assertEqual := func(c goja.FunctionCall) goja.Value {
			expected := c.Argument(0).Export()
			if !same(exported, expected) {
				fail("expected " + fmtValue(expected) + " but got " + fmtValue(exported))
			}
			return goja.Undefined()
		}
		deeply := vm.NewObject()
		_ = deeply.Set("eql", assertEqual)
		to := vm.NewObject()
		_ = to.Set("eql", assertEqual)
		_ = to.Set("equal", assertEqual)
		_ = to.Set("deeply", deeply)
		be := vm.NewObject()
		_ = be.Set("ok", func(goja.FunctionCall) goja.Value {
			if !actual.ToBoolean() {
				fail("expected truthy value but got " + fmtValue(exported))
			}
			return goja.Undefined()
		})
		_ = be.Set("true", func(goja.FunctionCall) goja.Value {
			if exported != true {
				fail("expected true but got " + fmtValue(exported))
			}
			return goja.Undefined()
		})
		_ = be.Set("false", func(goja.FunctionCall) goja.Value {
			if exported != false {
				fail("expected false but got " + fmtValue(exported))
			}
			return goja.Undefined()
		})
		_ = to.Set("be", be)
		api := vm.NewObject()
		_ = api.Set("to", to)
		_ = api.Set("a", func(c goja.FunctionCall) goja.Value {
			wanted := strings.ToLower(strings.TrimSpace(c.Argument(0).String()))
			ok := false
			switch wanted {
			case "object":
				_, ok = exported.(map[string]any)
			case "array":
				_, ok = exported.([]any)
			case "string":
				_, ok = exported.(string)
			case "number":
				_, ok = exported.(float64)
				if !ok {
					_, ok = exported.(int64)
				}
			case "boolean":
				_, ok = exported.(bool)
			default:
				ok = fmt.Sprintf("%T", exported) == wanted
			}
			if !ok {
				fail("expected type " + wanted + " but got " + fmt.Sprintf("%T", exported))
			}
			return goja.Undefined()
		})
		_ = api.Set("ok", func(goja.FunctionCall) goja.Value {
			if !actual.ToBoolean() {
				fail("expected truthy value but got " + fmtValue(exported))
			}
			return goja.Undefined()
		})
		return api
	}
	_ = pm.Set("expect", expect)
	_ = pm.Set("assert", func(call goja.FunctionCall) goja.Value {
		expr := strings.TrimSpace(call.Argument(0).String())
		if expr == "" {
			return goja.Undefined()
		}
		value, err := vm.RunString("!!(" + expr + ")")
		if err != nil {
			result.OK = false
			result.Tests = append(result.Tests, scriptTest{Name: expr, OK: false, Message: err.Error()})
			fail(err.Error())
		}
		if !value.ToBoolean() {
			message := "assert failed: " + expr
			result.OK = false
			result.Tests = append(result.Tests, scriptTest{Name: expr, OK: false, Message: message})
			fail(message)
		}
		result.Tests = append(result.Tests, scriptTest{Name: expr, OK: true})
		*logs = append(*logs, "assert passed: "+expr)
		return goja.Undefined()
	})
}

func attachRequestAPI(vm *goja.Runtime, pm *goja.Object, req *scriptRequestMut) {
	headersObj := vm.NewObject()
	_ = headersObj.Set("get", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		for _, row := range req.Headers {
			if strings.EqualFold(row.Key, key) {
				return vm.ToValue(row.Value)
			}
		}
		return goja.Undefined()
	})
	_ = headersObj.Set("set", func(call goja.FunctionCall) goja.Value {
		key := strings.TrimSpace(call.Argument(0).String())
		value := ""
		if !goja.IsUndefined(call.Argument(1)) && !goja.IsNull(call.Argument(1)) {
			value = call.Argument(1).String()
		}
		if key == "" {
			return goja.Undefined()
		}
		enabled := true
		for i := range req.Headers {
			if strings.EqualFold(req.Headers[i].Key, key) {
				req.Headers[i].Key = key
				req.Headers[i].Value = value
				req.Headers[i].Enabled = &enabled
				req.Dirty = true
				return goja.Undefined()
			}
		}
		req.Headers = append(req.Headers, headerPair{Key: key, Value: value, Enabled: &enabled})
		req.Dirty = true
		return goja.Undefined()
	})
	_ = headersObj.Set("upsert", headersObj.Get("set"))
	_ = headersObj.Set("remove", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		kept := req.Headers[:0]
		for _, row := range req.Headers {
			if !strings.EqualFold(row.Key, key) {
				kept = append(kept, row)
			} else {
				req.Dirty = true
			}
		}
		req.Headers = kept
		return goja.Undefined()
	})

	bodyObj := vm.NewObject()
	_ = bodyObj.DefineAccessorProperty("raw", vm.ToValue(func(goja.FunctionCall) goja.Value {
		return vm.ToValue(req.BodyRaw)
	}), vm.ToValue(func(call goja.FunctionCall) goja.Value {
		req.BodyRaw = call.Argument(0).String()
		if req.BodyMode == "" || req.BodyMode == "none" {
			req.BodyMode = "raw"
		}
		req.Dirty = true
		return goja.Undefined()
	}), goja.FLAG_FALSE, goja.FLAG_TRUE)
	_ = bodyObj.DefineAccessorProperty("mode", vm.ToValue(func(goja.FunctionCall) goja.Value {
		return vm.ToValue(req.BodyMode)
	}), vm.ToValue(func(call goja.FunctionCall) goja.Value {
		req.BodyMode = call.Argument(0).String()
		req.Dirty = true
		return goja.Undefined()
	}), goja.FLAG_FALSE, goja.FLAG_TRUE)
	_ = bodyObj.Set("update", func(call goja.FunctionCall) goja.Value {
		arg := call.Argument(0)
		if goja.IsUndefined(arg) || goja.IsNull(arg) {
			return goja.Undefined()
		}
		exported := arg.Export()
		switch value := exported.(type) {
		case string:
			req.BodyRaw = value
		default:
			raw, err := json.Marshal(value)
			if err != nil {
				req.BodyRaw = fmt.Sprint(value)
			} else {
				req.BodyRaw = string(raw)
			}
		}
		if req.BodyMode == "" || req.BodyMode == "none" {
			req.BodyMode = "raw"
		}
		if req.BodyContentType == "" {
			req.BodyContentType = "application/json"
		}
		req.Dirty = true
		return goja.Undefined()
	})

	authObj := vm.NewObject()
	_ = authObj.DefineAccessorProperty("type", vm.ToValue(func(goja.FunctionCall) goja.Value {
		return vm.ToValue(req.AuthType)
	}), vm.ToValue(func(call goja.FunctionCall) goja.Value {
		req.AuthType = call.Argument(0).String()
		req.Dirty = true
		return goja.Undefined()
	}), goja.FLAG_FALSE, goja.FLAG_TRUE)
	_ = authObj.DefineAccessorProperty("token", vm.ToValue(func(goja.FunctionCall) goja.Value {
		return vm.ToValue(req.AuthToken)
	}), vm.ToValue(func(call goja.FunctionCall) goja.Value {
		req.AuthToken = call.Argument(0).String()
		if req.AuthType == "" || req.AuthType == "none" {
			req.AuthType = "bearer"
		}
		req.Dirty = true
		return goja.Undefined()
	}), goja.FLAG_FALSE, goja.FLAG_TRUE)

	requestObj := vm.NewObject()
	_ = requestObj.DefineAccessorProperty("method", vm.ToValue(func(goja.FunctionCall) goja.Value {
		return vm.ToValue(req.Method)
	}), vm.ToValue(func(call goja.FunctionCall) goja.Value {
		req.Method = strings.ToUpper(strings.TrimSpace(call.Argument(0).String()))
		req.Dirty = true
		return goja.Undefined()
	}), goja.FLAG_FALSE, goja.FLAG_TRUE)
	_ = requestObj.DefineAccessorProperty("url", vm.ToValue(func(goja.FunctionCall) goja.Value {
		return vm.ToValue(req.URL)
	}), vm.ToValue(func(call goja.FunctionCall) goja.Value {
		req.URL = call.Argument(0).String()
		req.Dirty = true
		req.URLDirty = true
		return goja.Undefined()
	}), goja.FLAG_FALSE, goja.FLAG_TRUE)
	_ = requestObj.Set("headers", headersObj)
	_ = requestObj.Set("body", bodyObj)
	_ = requestObj.Set("auth", authObj)
	_ = pm.Set("request", requestObj)
}

// sendRequestLimiter bounds chained pm.sendRequest calls. depth is the nesting
// level of the script currently running (1 = the single-request script itself);
// calls is the total number of sub-requests issued by the whole chain.
type sendRequestLimiter struct {
	sender func(*sendRequest) *sendResult
	depth  int
	calls  int
	inIO   atomic.Int32 // number of in-flight blocking sub-requests in the chain
}

// attachSendRequestAPI wires a synchronous, restricted pm.sendRequest. The
// returned object is Postman-lite: { code, status, ok, json(), text(), headers }.
func attachSendRequestAPI(vm *goja.Runtime, pm *goja.Object, limiter *sendRequestLimiter) {
	_ = pm.Set("sendRequest", func(call goja.FunctionCall) goja.Value {
		if limiter == nil || limiter.sender == nil {
			panic(vm.ToValue("pm.sendRequest is only available in single-request scripts"))
		}
		if limiter.depth > sendRequestMaxDepth {
			panic(vm.ToValue(fmt.Sprintf("pm.sendRequest exceeds the maximum nesting depth of %d", sendRequestMaxDepth)))
		}
		if limiter.calls >= sendRequestMaxCalls {
			panic(vm.ToValue(fmt.Sprintf("pm.sendRequest exceeds the limit of %d calls per script", sendRequestMaxCalls)))
		}
		limiter.calls++
		spec, err := parseSendSpec(call.Argument(0))
		if err != nil {
			panic(vm.ToValue("pm.sendRequest: " + err.Error()))
		}
		spec.RequestID = fmt.Sprintf("script-%d-%d-%d", time.Now().UnixNano(),
			limiter.calls, scriptRequestSeq.Add(1))

		// A child request runs at depth+1; a script at that depth is allowed to
		// chain again until the depth cap is hit. The JS watchdog is paused for
		// the duration of the blocking Go-side call.
		result := func() *sendResult {
			limiter.inIO.Add(1)
			defer limiter.inIO.Add(-1)
			limiter.depth++
			defer func() { limiter.depth-- }()
			return limiter.sender(spec)
		}()

		if result == nil {
			panic(vm.ToValue("pm.sendRequest: empty result"))
		}
		if result.Error != nil {
			panic(vm.ToValue("pm.sendRequest failed: " + result.Error.Message))
		}
		bodyText := ""
		if result.BodyPreviewBase64 != "" {
			if raw, decodeErr := base64.StdEncoding.DecodeString(result.BodyPreviewBase64); decodeErr == nil {
				bodyText = string(raw)
			}
		}
		headers := map[string]string{}
		for _, row := range result.Headers {
			if row.Key != "" {
				headers[strings.ToLower(row.Key)] = row.Value
			}
		}
		out := vm.NewObject()
		_ = out.Set("code", result.Status)
		_ = out.Set("status", result.StatusText)
		_ = out.Set("ok", result.OK && result.Status >= 200 && result.Status < 300)
		_ = out.Set("headers", headers)
		_ = out.Set("text", func(goja.FunctionCall) goja.Value {
			return vm.ToValue(bodyText)
		})
		_ = out.Set("json", func(goja.FunctionCall) goja.Value {
			var parsed any
			if err := json.Unmarshal([]byte(bodyText), &parsed); err != nil {
				panic(vm.ToValue("response body is not JSON: " + err.Error()))
			}
			return vm.ToValue(parsed)
		})
		return out
	})
}

// parseSendSpec accepts a URL string or a { method, url, headers, body,
// timeoutMs } object. Only http/https URLs are allowed, and the timeout is
// always pinned to sendRequestTimeoutMs no matter what the script requests.
func parseSendSpec(value goja.Value) (*sendRequest, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return nil, fmt.Errorf("missing request spec")
	}
	spec := &sendRequest{}
	switch exported := value.Export().(type) {
	case string:
		spec.URL = strings.TrimSpace(exported)
	case map[string]any:
		spec.Method = strings.TrimSpace(specString(exported["method"]))
		spec.URL = strings.TrimSpace(specString(exported["url"]))
		spec.Headers = specHeaders(exported["headers"])
		switch body := exported["body"].(type) {
		case nil:
		case string:
			spec.Body.Raw = body
		default:
			raw, err := json.Marshal(body)
			if err != nil {
				return nil, fmt.Errorf("invalid body: %v", err)
			}
			spec.Body.Raw = string(raw)
			if spec.Body.Raw != "" {
				spec.Body.ContentType = "application/json"
			}
		}
		if spec.Body.Raw != "" {
			spec.Body.Mode = "raw"
		}
	default:
		return nil, fmt.Errorf("spec must be a URL string or an object")
	}

	spec.Method = strings.ToUpper(strings.TrimSpace(spec.Method))
	if spec.Method == "" {
		spec.Method = "GET"
	}
	parsed, err := url.Parse(spec.URL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %v", err)
	}
	if scheme := strings.ToLower(parsed.Scheme); scheme != "http" && scheme != "https" {
		return nil, fmt.Errorf("only http/https URLs are allowed, got %q", spec.URL)
	}
	if parsed.Host == "" {
		return nil, fmt.Errorf("URL is missing a host: %q", spec.URL)
	}

	spec.Options = requestOptions{
		TimeoutMs:      sendRequestTimeoutMs,
		ProgressEvents: false,
		RetryCount:     0,
		RetryOnNetwork: false,
	}
	spec.normalize()
	// Pinned after normalize(): a script may pass timeoutMs in the spec object
	// for compatibility, but it can never lengthen or shorten the 10 s cap.
	spec.Options.TimeoutMs = sendRequestTimeoutMs
	return spec, nil
}

func specString(value any) string {
	if value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return fmt.Sprint(value)
}

// specHeaders accepts both a { key: value } object and an array of
// { key, value } rows (the shape used by the plugin request editor).
func specHeaders(value any) []headerPair {
	out := []headerPair{}
	switch headers := value.(type) {
	case map[string]any:
		for key, item := range headers {
			out = append(out, headerPair{Key: key, Value: specString(item)})
		}
	case []any:
		for _, item := range headers {
			row, ok := item.(map[string]any)
			if !ok {
				continue
			}
			key := strings.TrimSpace(specString(row["key"]))
			if key == "" {
				continue
			}
			out = append(out, headerPair{Key: key, Value: specString(row["value"])})
		}
	}
	return out
}
