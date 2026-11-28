package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/datawise/community-plugin-http-client/internal/rpc"
)

type workflowStep struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	ClientType string         `json:"clientType"`
	Method     string         `json:"method"`
	URL        string         `json:"url"`
	Headers    []headerPair   `json:"headers"`
	Params     []headerPair   `json:"params"`
	PathParams []headerPair   `json:"pathParams"`
	Cookies    []headerPair   `json:"cookies"`
	Body       requestBody    `json:"body"`
	Auth       authConfig     `json:"auth"`
	Options    requestOptions `json:"options"`
	// RunPolicy: "each" (default, every round) or "once" (first round only).
	RunPolicy string `json:"runPolicy"`
	Scripts   struct {
		Pre  string `json:"pre"`
		Post string `json:"post"`
	} `json:"scripts"`
}

type workflowStartParams struct {
	RunID      string              `json:"runId"`
	FolderID   string              `json:"folderId"`
	FolderName string              `json:"folderName"`
	Mode       string              `json:"mode"` // once | rounds | forever
	Rounds     int                 `json:"rounds"`
	IntervalMs int                 `json:"intervalMs"`
	OnError    string              `json:"onError"`    // stop | continue
	AuthStepID string              `json:"authStepId"` // optional: re-run on HTTP 401 then retry once
	Variables  map[string]string   `json:"variables"`
	Dataset    []map[string]string `json:"dataset"`
	Steps      []workflowStep      `json:"steps"`
}

type workflowStopParams struct {
	RunID string `json:"runId"`
}

type workflowRunSnapshot struct {
	RunID        string            `json:"runId"`
	FolderID     string            `json:"folderId"`
	FolderName   string            `json:"folderName"`
	Mode         string            `json:"mode"`
	Rounds       int               `json:"rounds"`
	IntervalMs   int               `json:"intervalMs"`
	OnError      string            `json:"onError"`
	Status       string            `json:"status"` // running | paused | stopping | finished | stopped | failed
	Round        int               `json:"round"`
	StepIndex    int               `json:"stepIndex"`
	StepID       string            `json:"stepId,omitempty"`
	StepName     string            `json:"stepName,omitempty"`
	OkCount      int               `json:"okCount"`
	FailCount    int               `json:"failCount"`
	StartedAtMs  int64             `json:"startedAtMs"`
	FinishedAtMs int64             `json:"finishedAtMs,omitempty"`
	Message      string            `json:"message,omitempty"`
	Variables    map[string]string `json:"variables,omitempty"`
	StepCount    int               `json:"stepCount"`
	AuthStepID   string            `json:"authStepId,omitempty"`
	Paused       bool              `json:"paused,omitempty"`
}

type workflowHub struct {
	mu     sync.Mutex
	active *workflowJob
}

type workflowJob struct {
	cancel     context.CancelFunc
	snap       workflowRunSnapshot
	vars       map[string]string
	dataset    []map[string]string
	authStepID string
	paused     atomic.Bool
	intervalMs atomic.Int64
}

func newWorkflowHub() *workflowHub {
	return &workflowHub{}
}

func (h *workflowHub) status() map[string]any {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.active == nil {
		return map[string]any{"active": false}
	}
	copySnap := h.active.snap
	copySnap.Variables = cloneStringMap(h.active.vars)
	copySnap.Paused = h.active.paused.Load()
	copySnap.IntervalMs = int(h.active.intervalMs.Load())
	if copySnap.Paused && copySnap.Status == "running" {
		copySnap.Status = "paused"
	}
	return map[string]any{"active": true, "run": copySnap}
}

func (h *workflowHub) stop(runID string) map[string]any {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.active == nil {
		return map[string]any{"stopped": false, "reason": "idle"}
	}
	if runID != "" && h.active.snap.RunID != runID {
		return map[string]any{"stopped": false, "reason": "mismatch"}
	}
	h.active.snap.Status = "stopping"
	h.active.paused.Store(false)
	h.active.cancel()
	return map[string]any{"stopped": true, "runId": h.active.snap.RunID}
}

func (h *workflowHub) setPaused(runID string, paused bool) map[string]any {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.active == nil {
		return map[string]any{"ok": false, "reason": "idle"}
	}
	if runID != "" && h.active.snap.RunID != runID {
		return map[string]any{"ok": false, "reason": "mismatch"}
	}
	if h.active.snap.Status != "running" && h.active.snap.Status != "paused" {
		return map[string]any{"ok": false, "reason": "not-running"}
	}
	h.active.paused.Store(paused)
	if paused {
		h.active.snap.Status = "paused"
		h.active.snap.Paused = true
	} else {
		h.active.snap.Status = "running"
		h.active.snap.Paused = false
	}
	return map[string]any{"ok": true, "runId": h.active.snap.RunID, "paused": paused}
}

func (h *workflowHub) setInterval(runID string, intervalMs int) map[string]any {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.active == nil {
		return map[string]any{"ok": false, "reason": "idle"}
	}
	if runID != "" && h.active.snap.RunID != runID {
		return map[string]any{"ok": false, "reason": "mismatch"}
	}
	if intervalMs < 0 {
		intervalMs = 0
	}
	h.active.intervalMs.Store(int64(intervalMs))
	h.active.snap.IntervalMs = intervalMs
	return map[string]any{"ok": true, "runId": h.active.snap.RunID, "intervalMs": intervalMs}
}

func (p *plugin) handleWorkflowStart(params json.RawMessage, emitter *rpc.Emitter) (any, *rpc.PluginError) {
	var spec workflowStartParams
	if err := decodeParams(params, &spec); err != nil {
		return nil, err
	}
	spec.Mode = strings.ToLower(strings.TrimSpace(spec.Mode))
	if spec.Mode == "" {
		spec.Mode = "once"
	}
	if spec.Mode != "once" && spec.Mode != "rounds" && spec.Mode != "forever" {
		return nil, rpc.NewError(-32602, "mode must be once, rounds, or forever")
	}
	if spec.Mode == "rounds" && spec.Rounds <= 0 {
		return nil, rpc.NewError(-32602, "rounds must be > 0 when mode is rounds")
	}
	if spec.IntervalMs < 0 {
		spec.IntervalMs = 0
	}
	spec.OnError = strings.ToLower(strings.TrimSpace(spec.OnError))
	if spec.OnError == "" {
		spec.OnError = "stop"
	}
	if spec.OnError != "stop" && spec.OnError != "continue" {
		return nil, rpc.NewError(-32602, "onError must be stop or continue")
	}
	if strings.TrimSpace(spec.RunID) == "" {
		spec.RunID = fmt.Sprintf("run-%d", time.Now().UnixNano())
	}
	steps := make([]workflowStep, 0, len(spec.Steps))
	for _, step := range spec.Steps {
		clientType := strings.ToLower(strings.TrimSpace(step.ClientType))
		if clientType == "" {
			clientType = "http"
		}
		if clientType != "http" && clientType != "graphql" {
			continue
		}
		if strings.TrimSpace(step.URL) == "" {
			continue
		}
		step.ClientType = clientType
		step.RunPolicy = normalizeRunPolicy(step.RunPolicy)
		steps = append(steps, step)
	}
	if len(steps) == 0 {
		return nil, rpc.NewError(-32602, "folder has no runnable HTTP steps")
	}

	// Validate before taking the hub lock: returning while holding it would
	// deadlock every subsequent workflow/* RPC (and leak the cancel func).
	authStepID := strings.TrimSpace(spec.AuthStepID)
	if authStepID != "" {
		found := false
		for _, step := range steps {
			if step.ID == authStepID {
				found = true
				break
			}
		}
		if !found {
			return nil, rpc.NewError(-32602, "authStepId does not match any step in the folder")
		}
	}
	vars := cloneStringMap(spec.Variables)
	if vars == nil {
		vars = map[string]string{}
	}
	// Data-driven runs: each round overlays one row on top of the shared vars.
	// Scripts can still set extra keys; those survive to the next round.
	dataset := make([]map[string]string, 0, len(spec.Dataset))
	for _, row := range spec.Dataset {
		clean := cloneStringMap(row)
		if clean == nil {
			clean = map[string]string{}
		}
		dataset = append(dataset, clean)
	}
	ctx, cancel := context.WithCancel(context.Background())
	p.workflows.mu.Lock()
	if p.workflows.active != nil {
		st := p.workflows.active.snap.Status
		if st == "running" || st == "paused" || st == "stopping" {
			p.workflows.mu.Unlock()
			cancel()
			return nil, rpc.NewError(-32010, "a workflow is already running; stop it first")
		}
	}
	job := &workflowJob{
		cancel:     cancel,
		vars:       vars,
		dataset:    dataset,
		authStepID: authStepID,
		snap: workflowRunSnapshot{
			RunID:       spec.RunID,
			FolderID:    spec.FolderID,
			FolderName:  spec.FolderName,
			Mode:        spec.Mode,
			Rounds:      spec.Rounds,
			IntervalMs:  spec.IntervalMs,
			OnError:     spec.OnError,
			AuthStepID:  authStepID,
			Status:      "running",
			StartedAtMs: time.Now().UnixMilli(),
			StepCount:   len(steps),
		},
	}
	job.intervalMs.Store(int64(spec.IntervalMs))
	p.workflows.active = job
	p.workflows.mu.Unlock()

	go p.runWorkflow(ctx, job, steps, emitter)

	return map[string]any{
		"ok":    true,
		"runId": spec.RunID,
		"steps": len(steps),
	}, nil
}

func (p *plugin) handleWorkflowStop(params json.RawMessage) (any, *rpc.PluginError) {
	var spec workflowStopParams
	if len(params) > 0 && string(params) != "null" {
		if err := decodeParams(params, &spec); err != nil {
			return nil, err
		}
	}
	return p.workflows.stop(spec.RunID), nil
}

func (p *plugin) handleWorkflowStatus(_ json.RawMessage) (any, *rpc.PluginError) {
	return p.workflows.status(), nil
}

func (p *plugin) handleWorkflowPause(params json.RawMessage) (any, *rpc.PluginError) {
	var spec struct {
		RunID  string `json:"runId"`
		Paused *bool  `json:"paused"`
	}
	if err := decodeParams(params, &spec); err != nil {
		return nil, err
	}
	paused := true
	if spec.Paused != nil {
		paused = *spec.Paused
	}
	return p.workflows.setPaused(spec.RunID, paused), nil
}

func (p *plugin) handleWorkflowSetInterval(params json.RawMessage) (any, *rpc.PluginError) {
	var spec struct {
		RunID      string `json:"runId"`
		IntervalMs int    `json:"intervalMs"`
	}
	if err := decodeParams(params, &spec); err != nil {
		return nil, err
	}
	return p.workflows.setInterval(spec.RunID, spec.IntervalMs), nil
}

func (p *plugin) runWorkflow(ctx context.Context, job *workflowJob, steps []workflowStep, emitter *rpc.Emitter) {
	emit := func(phase string, extra map[string]any) {
		payload := map[string]any{
			"runId":      job.snap.RunID,
			"phase":      phase,
			"folderId":   job.snap.FolderID,
			"folderName": job.snap.FolderName,
			"mode":       job.snap.Mode,
			"round":      job.snap.Round,
			"stepIndex":  job.snap.StepIndex,
			"stepId":     job.snap.StepID,
			"stepName":   job.snap.StepName,
			"okCount":    job.snap.OkCount,
			"failCount":  job.snap.FailCount,
			"status":     job.snap.Status,
			"message":    job.snap.Message,
			"stepCount":  job.snap.StepCount,
		}
		for key, value := range extra {
			payload[key] = value
		}
		_ = emitter.Event("workflow/progress", payload)
	}

	emitVars := func() {
		_ = emitter.Event("workflow/variables", map[string]any{
			"runId":     job.snap.RunID,
			"variables": cloneStringMap(job.vars),
		})
	}

	defer func() {
		p.workflows.mu.Lock()
		job.snap.FinishedAtMs = time.Now().UnixMilli()
		if job.snap.Status == "running" || job.snap.Status == "stopping" {
			if ctx.Err() != nil {
				job.snap.Status = "stopped"
			} else if job.snap.FailCount > 0 && job.snap.OkCount == 0 {
				job.snap.Status = "failed"
			} else {
				job.snap.Status = "finished"
			}
		}
		finalStatus := job.snap.Status
		p.workflows.mu.Unlock()
		emitVars()
		emit(finalStatus, nil)
	}()

	waitWhilePaused := func() bool {
		emitted := false
		for job.paused.Load() {
			if !emitted {
				emit("paused", nil)
				emitted = true
			}
			if ctx.Err() != nil {
				return false
			}
			timer := time.NewTimer(200 * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return false
			case <-timer.C:
			}
		}
		if emitted {
			p.workflows.mu.Lock()
			if job.snap.Status == "paused" {
				job.snap.Status = "running"
			}
			p.workflows.mu.Unlock()
			emit("resumed", nil)
		}
		return true
	}

	emit("starting", nil)

	round := 0
	for {
		if ctx.Err() != nil {
			p.workflows.mu.Lock()
			job.snap.Status = "stopped"
			job.snap.Message = "stopped by user"
			p.workflows.mu.Unlock()
			return
		}
		if !waitWhilePaused() {
			p.workflows.mu.Lock()
			job.snap.Status = "stopped"
			job.snap.Message = "stopped by user"
			p.workflows.mu.Unlock()
			return
		}
		round++
		p.workflows.mu.Lock()
		job.snap.Round = round
		job.snap.StepIndex = 0
		job.snap.StepID = ""
		job.snap.StepName = ""
		datasetRow := applyDatasetRow(job.vars, job.dataset, round)
		p.workflows.mu.Unlock()
		roundExtra := map[string]any{}
		if datasetRow != nil {
			roundExtra["datasetIndex"] = (round-1)%len(job.dataset) + 1
			roundExtra["datasetTotal"] = len(job.dataset)
			roundExtra["datasetRow"] = datasetRow
		}
		emit("round-start", roundExtra)

		roundFailed := false
		for index, step := range steps {
			if ctx.Err() != nil {
				p.workflows.mu.Lock()
				job.snap.Status = "stopped"
				job.snap.Message = "stopped by user"
				p.workflows.mu.Unlock()
				return
			}
			if !waitWhilePaused() {
				p.workflows.mu.Lock()
				job.snap.Status = "stopped"
				job.snap.Message = "stopped by user"
				p.workflows.mu.Unlock()
				return
			}
			p.workflows.mu.Lock()
			job.snap.StepIndex = index
			job.snap.StepID = step.ID
			job.snap.StepName = step.Name
			p.workflows.mu.Unlock()

			if round > 1 && normalizeRunPolicy(step.RunPolicy) == "once" {
				emit("step-skip", map[string]any{
					"reason":    "once",
					"runPolicy": "once",
				})
				continue
			}

			emit("step-start", nil)

			stepOK, stepErr, status, durationMs, scriptLogs, bodyPreview, tests := p.executeWorkflowStep(ctx, job, step, round)
			retriedAuth := false
			if !stepOK && status == 401 && job.authStepID != "" && step.ID != job.authStepID {
				authStep, authIndex := findWorkflowStep(steps, job.authStepID)
				if authStep != nil {
					retriedAuth = true
					emit("auth-retry", map[string]any{
						"authStepId":   authStep.ID,
						"authStepName": authStep.Name,
						"authIndex":    authIndex,
					})
					authOK, authErr, authStatus, authMs, authLogs, _, authTests := p.executeWorkflowStep(ctx, job, *authStep, round)
					tests = append(tests, authTests...)
					scriptLogs = append(scriptLogs, authLogs...)
					durationMs += authMs
					if authOK {
						var retryMs int64
						var retryLogs []string
						var retryBody string
						var retryTests []scriptTest
						stepOK, stepErr, status, retryMs, retryLogs, retryBody, retryTests = p.executeWorkflowStep(ctx, job, step, round)
						scriptLogs = append(scriptLogs, retryLogs...)
						durationMs += retryMs
						bodyPreview = retryBody
						tests = append(tests, retryTests...)
					} else {
						stepErr = "auth-refresh: " + authErr
						status = authStatus
					}
				}
			}
			extra := map[string]any{
				"ok":          stepOK,
				"status":      status,
				"durationMs":  durationMs,
				"scriptLogs":  scriptLogs,
				"authRetried": retriedAuth,
			}
			if len(tests) > 0 {
				extra["tests"] = tests
			}
			if stepErr != "" {
				extra["error"] = stepErr
			}
			if !stepOK && bodyPreview != "" {
				extra["bodyPreview"] = truncateRunes(bodyPreview, 2000)
			}
			p.workflows.mu.Lock()
			if stepOK {
				job.snap.OkCount++
			} else {
				job.snap.FailCount++
				job.snap.Message = stepErr
				roundFailed = true
			}
			p.workflows.mu.Unlock()
			emit("step-done", extra)
			emitVars()

			if !stepOK && job.snap.OnError == "stop" {
				p.workflows.mu.Lock()
				job.snap.Status = "failed"
				p.workflows.mu.Unlock()
				return
			}
		}

		emit("round-done", map[string]any{"roundFailed": roundFailed})

		if job.snap.Mode == "once" {
			return
		}
		if job.snap.Mode == "rounds" && round >= job.snap.Rounds {
			return
		}

		intervalMs := int(job.intervalMs.Load())
		p.workflows.mu.Lock()
		job.snap.IntervalMs = intervalMs
		p.workflows.mu.Unlock()
		deadline := time.Now().Add(time.Duration(intervalMs) * time.Millisecond)
		if intervalMs <= 0 {
			deadline = time.Now().Add(time.Millisecond)
		}
		for time.Now().Before(deadline) {
			if ctx.Err() != nil {
				p.workflows.mu.Lock()
				job.snap.Status = "stopped"
				job.snap.Message = "stopped by user"
				p.workflows.mu.Unlock()
				return
			}
			if !waitWhilePaused() {
				p.workflows.mu.Lock()
				job.snap.Status = "stopped"
				job.snap.Message = "stopped by user"
				p.workflows.mu.Unlock()
				return
			}
			if next := int(job.intervalMs.Load()); next != intervalMs {
				intervalMs = next
				p.workflows.mu.Lock()
				job.snap.IntervalMs = intervalMs
				p.workflows.mu.Unlock()
				deadline = time.Now().Add(time.Duration(intervalMs) * time.Millisecond)
				if intervalMs <= 0 {
					deadline = time.Now().Add(time.Millisecond)
				}
				continue
			}
			remain := time.Until(deadline)
			if remain <= 0 {
				break
			}
			slice := remain
			if slice > 200*time.Millisecond {
				slice = 200 * time.Millisecond
			}
			timer := time.NewTimer(slice)
			select {
			case <-ctx.Done():
				timer.Stop()
				p.workflows.mu.Lock()
				job.snap.Status = "stopped"
				job.snap.Message = "stopped by user"
				p.workflows.mu.Unlock()
				return
			case <-timer.C:
			}
		}
	}
}

func findWorkflowStep(steps []workflowStep, id string) (*workflowStep, int) {
	for index := range steps {
		if steps[index].ID == id {
			return &steps[index], index
		}
	}
	return nil, -1
}

func normalizeRunPolicy(policy string) string {
	switch strings.ToLower(strings.TrimSpace(policy)) {
	case "once", "first", "setup":
		return "once"
	default:
		return "each"
	}
}

func (p *plugin) executeWorkflowStep(
	ctx context.Context,
	job *workflowJob,
	step workflowStep,
	round int,
) (ok bool, errMessage string, status int, durationMs int64, scriptLogs []string, bodyPreview string, tests []scriptTest) {
	working := cloneWorkflowStep(step)
	mut := stepToMut(working, job.vars, round)
	pre := runScript(working.Scripts.Pre, job.vars, nil, mut)
	scriptLogs = append(scriptLogs, pre.Logs...)
	tests = append(tests, pre.Tests...)
	durationMs += pre.DurationMs
	if pre.Error != "" {
		return false, "pre-script: " + pre.Error, 0, durationMs, scriptLogs, "", tests
	}
	if !pre.OK {
		return false, "pre-script assertions failed: " + failedTestMessage(pre.Tests), 0, durationMs, scriptLogs, "", tests
	}
	applyMutToStep(&working, mut)

	spec, buildErr := buildWorkflowSend(working, job.vars, round, job.snap.RunID)
	if buildErr != nil {
		return false, buildErr.Error(), 0, durationMs, scriptLogs, "", tests
	}
	if ctx.Err() != nil {
		return false, "stopped", 0, durationMs, scriptLogs, "", tests
	}

	// Reuse the normal executor; progressEvents off keeps folder runs quieter.
	spec.Options.ProgressEvents = false
	result := p.executor.execute(spec, rpc.DiscardEmitter())
	durationMs += result.DurationMs
	status = result.Status
	if result.Error != nil {
		return false, result.Error.Message, status, durationMs, scriptLogs, "", tests
	}

	bodyText := ""
	if result.BodyPreviewBase64 != "" {
		if raw, err := base64.StdEncoding.DecodeString(result.BodyPreviewBase64); err == nil {
			bodyText = string(raw)
		}
	}
	bodyPreview = bodyText
	headers := map[string]string{}
	for _, header := range result.Headers {
		if header.Key != "" {
			headers[strings.ToLower(header.Key)] = header.Value
		}
	}
	post := runScript(working.Scripts.Post, job.vars, &scriptResponse{
		Status:     result.Status,
		StatusText: result.StatusText,
		DurationMs: result.DurationMs,
		Headers:    headers,
		BodyText:   bodyText,
	}, nil)
	scriptLogs = append(scriptLogs, post.Logs...)
	tests = append(tests, post.Tests...)
	durationMs += post.DurationMs
	if post.Error != "" {
		return false, "post-script: " + post.Error, status, durationMs, scriptLogs, bodyPreview, tests
	}
	// A failing pm.test / pm.expect is a step failure, not just a log line.
	if !post.OK {
		return false, "post-script assertions failed: " + failedTestMessage(post.Tests), status, durationMs, scriptLogs, bodyPreview, tests
	}
	// HTTP transport succeeded; treat 4xx/5xx as step failure so onError can stop.
	if result.Status >= 400 {
		return false, fmt.Sprintf("HTTP %d %s", result.Status, result.StatusText), status, durationMs, scriptLogs, bodyPreview, tests
	}
	return true, "", status, durationMs, scriptLogs, bodyPreview, tests
}

func failedTestMessage(tests []scriptTest) string {
	failed := make([]string, 0, len(tests))
	for _, test := range tests {
		if test.OK {
			continue
		}
		message := test.Name
		if test.Message != "" {
			message += ": " + test.Message
		}
		failed = append(failed, message)
	}
	if len(failed) == 0 {
		return "assertion failed"
	}
	return strings.Join(failed, "; ")
}

func truncateRunes(text string, limit int) string {
	if limit <= 0 || text == "" {
		return text
	}
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit]) + "…"
}

func cloneWorkflowStep(step workflowStep) workflowStep {
	clone := step
	if step.Headers != nil {
		clone.Headers = append([]headerPair(nil), step.Headers...)
	}
	if step.Params != nil {
		clone.Params = append([]headerPair(nil), step.Params...)
	}
	if step.PathParams != nil {
		clone.PathParams = append([]headerPair(nil), step.PathParams...)
	}
	if step.Cookies != nil {
		clone.Cookies = append([]headerPair(nil), step.Cookies...)
	}
	if step.Body.Fields != nil {
		clone.Body.Fields = append([]bodyField(nil), step.Body.Fields...)
	}
	return clone
}

func buildWorkflowSend(step workflowStep, vars map[string]string, round int, runID string) (*sendRequest, error) {
	resolve := func(value string) string {
		return resolveVars(value, vars, round)
	}

	rawURL := strings.TrimSpace(resolve(step.URL))
	for _, row := range step.PathParams {
		if !row.active() || strings.TrimSpace(row.Key) == "" {
			continue
		}
		key := resolve(row.Key)
		value := url.PathEscape(resolve(row.Value))
		if value == "" {
			continue
		}
		rawURL = strings.ReplaceAll(rawURL, ":"+key, value)
		rawURL = strings.ReplaceAll(rawURL, "{"+key+"}", value)
	}

	base, hash := splitURLHash(rawURL)
	pathOnly, existingQuery := splitURLQuery(base)
	queryParts := make([]string, 0, len(step.Params))
	for _, row := range step.Params {
		if !row.active() || strings.TrimSpace(row.Key) == "" {
			continue
		}
		key := url.QueryEscape(resolve(row.Key))
		value := url.QueryEscape(resolve(row.Value))
		queryParts = append(queryParts, key+"="+value)
	}
	switch {
	case len(queryParts) > 0:
		pathOnly = pathOnly + "?" + strings.Join(queryParts, "&")
	case existingQuery != "":
		// Keep query embedded in the URL when the params table is empty.
		pathOnly = pathOnly + "?" + existingQuery
	}
	if hash != "" {
		pathOnly = pathOnly + "#" + hash
	}

	headers := make([]headerPair, 0, len(step.Headers)+1)
	for _, row := range step.Headers {
		if !row.active() || strings.TrimSpace(row.Key) == "" {
			continue
		}
		enabled := true
		headers = append(headers, headerPair{
			Key:     resolve(row.Key),
			Value:   resolve(row.Value),
			Enabled: &enabled,
		})
	}
	cookieParts := make([]string, 0, len(step.Cookies))
	for _, row := range step.Cookies {
		if !row.active() || strings.TrimSpace(row.Key) == "" {
			continue
		}
		cookieParts = append(cookieParts, resolve(row.Key)+"="+resolve(row.Value))
	}
	if len(cookieParts) > 0 {
		joined := strings.Join(cookieParts, "; ")
		found := false
		for i := range headers {
			if strings.EqualFold(headers[i].Key, "Cookie") {
				if headers[i].Value != "" {
					headers[i].Value += "; " + joined
				} else {
					headers[i].Value = joined
				}
				found = true
				break
			}
		}
		if !found {
			enabled := true
			headers = append(headers, headerPair{Key: "Cookie", Value: joined, Enabled: &enabled})
		}
	}

	body := step.Body
	body.Raw = resolve(body.Raw)
	body.ContentType = resolve(body.ContentType)
	if len(body.Fields) > 0 {
		fields := make([]bodyField, len(body.Fields))
		for i, field := range body.Fields {
			fields[i] = field
			fields[i].Key = resolve(field.Key)
			if field.Kind != "file" {
				fields[i].Value = resolve(field.Value)
			}
			fields[i].FileName = resolve(field.FileName)
			fields[i].ContentType = resolve(field.ContentType)
		}
		body.Fields = fields
	}

	auth := step.Auth
	auth.Username = resolve(auth.Username)
	auth.Password = resolve(auth.Password)
	auth.Token = resolve(auth.Token)
	auth.Key = resolve(auth.Key)
	auth.Value = resolve(auth.Value)

	options := step.Options
	options.ProxyURL = resolve(options.ProxyURL)

	spec := &sendRequest{
		RequestID: fmt.Sprintf("%s-%d-%s", runID, round, step.ID),
		Method:    step.Method,
		URL:       pathOnly,
		Headers:   headers,
		Body:      body,
		Auth:      auth,
		Options:   options,
	}
	spec.normalize()
	return spec, nil
}

func splitURLHash(raw string) (base, hash string) {
	index := strings.Index(raw, "#")
	if index < 0 {
		return raw, ""
	}
	return raw[:index], raw[index+1:]
}

func splitURLQuery(raw string) (path, query string) {
	index := strings.Index(raw, "?")
	if index < 0 {
		return raw, ""
	}
	return raw[:index], raw[index+1:]
}

// applyDatasetRow overlays the row bound to this 1-based round onto vars and
// returns it (nil when no dataset is configured). Rows cycle when there are
// more rounds than rows, so "forever" mode keeps cycling predictably.
func applyDatasetRow(vars map[string]string, dataset []map[string]string, round int) map[string]string {
	if len(dataset) == 0 {
		return nil
	}
	index := (round - 1) % len(dataset)
	if index < 0 {
		index = 0
	}
	row := dataset[index]
	if vars != nil {
		for key, value := range row {
			vars[key] = value
		}
	}
	return row
}

func cloneStringMap(in map[string]string) map[string]string {
	if in == nil {
		return nil
	}
	out := make(map[string]string, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}
