package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"

	dbxpluginsdk "github.com/t8y2/dbx/plugins/sdk/go/dbx-plugin-sdk"
	"golang.org/x/crypto/ssh"
)

const (
	pluginID      = "io.datawise.community.process-ops"
	pluginVersion = "0.1.0"
)

func main() {
	p := newPlugin()
	server := dbxpluginsdk.NewServer(dbxpluginsdk.Metadata{
		ID:           pluginID,
		Version:      pluginVersion,
		Capabilities: []string{"connections", "events"},
	}, p)
	if err := server.Serve(); err != nil {
		fmt.Fprintf(os.Stderr, "process-ops sidecar: %v\n", err)
		os.Exit(1)
	}
}

func (p *plugin) Handle(_ dbxpluginsdk.RequestContext, method string, params json.RawMessage, _ *dbxpluginsdk.Emitter) (any, *dbxpluginsdk.PluginError) {
	switch method {
	case "plugin/ping":
		return map[string]any{"ok": true, "plugin": pluginID, "version": pluginVersion}, nil
	case "workbench/close":
		return map[string]any{"ok": true}, nil
	case "connection/test":
		return map[string]any{"success": true, "message": "workspace ready"}, nil
	case "connection/connect":
		return p.handleConnect(params)
	case "connection/disconnect":
		return p.handleDisconnect(params)
	case "process/targets/sync":
		return p.handleTargetsSync(params)
	case "process/targets/reconnect":
		return p.handleTargetsReconnect(params)
	case "process/targets/keepalive":
		return p.handleTargetsKeepalive(params)
	case "process/targets/probe":
		return p.handleTargetsProbe(params)
	case "process/overview":
		return p.handleOverview(params)
	case "process/metrics/history":
		return p.handleHistory(params)
	case "process/list":
		return p.handleList(params)
	case "process/kill":
		return p.handleKill(params)
	case "process/services/list":
		return p.handleServicesList(params)
	case "process/services/action":
		return p.handleServicesAction(params)
	case "process/diagnose":
		return p.handleDiagnose(params)
	case "process/jvm/snapshot":
		return p.handleJvmSnapshot(params)
	case "process/exec":
		return p.handleExec(params)
	case "process/exec/batch":
		return p.handleExecBatch(params)
	case "process/logs":
		return p.handleLogs(params)
	case "process/bastion/discover":
		return p.handleBastionDiscover(params)
	default:
		return nil, dbxpluginsdk.MethodNotFound(method)
	}
}

func (p *plugin) handleConnect(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	m, err := decodeMap(params)
	if err != nil {
		return nil, err
	}
	id := strVal(m, "connectionId")
	if id == "" {
		id = strVal(asMap(m["connection"]), "id")
	}
	if id == "" {
		return nil, dbxpluginsdk.NewError(-32602, "connectionId is required")
	}
	ws := p.putWorkspace(id)
	// Seed localhost so overview/list work before the UI finishes targets/sync.
	_ = ws.syncTargets([]TargetSpec{{
		ID: "localhost", DisplayName: "localhost", Kind: TargetLocal,
	}})
	return map[string]any{"success": true, "connectionId": id}, nil
}

func (p *plugin) handleDisconnect(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	m, err := decodeMap(params)
	if err != nil {
		return nil, err
	}
	p.dropWorkspace(strVal(m, "connectionId"))
	return map[string]any{"success": true}, nil
}

func (p *plugin) handleTargetsProbe(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	m, err := decodeMap(params)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(m["target"])
	if string(raw) == "null" || len(raw) == 0 {
		// Allow flat fields for convenience
		raw, _ = json.Marshal(m)
	}
	var spec TargetSpec
	if err := json.Unmarshal(raw, &spec); err != nil {
		return nil, dbxpluginsdk.NewError(-32602, "target is required")
	}
	if spec.Kind == "" {
		if strings.EqualFold(strVal(m, "kind"), "ssh") || strVal(m, "host") != "" {
			spec.Kind = TargetSSH
		} else {
			spec.Kind = TargetLocal
		}
	}
	if spec.Kind == TargetLocal {
		c := localCollector{}
		ov, oerr := c.Overview("localhost")
		if oerr != nil {
			return map[string]any{"success": false, "message": oerr.Error()}, nil
		}
		return map[string]any{
			"success":  true,
			"message":  "ok",
			"kind":     "local",
			"hostname": ov.Hostname,
			"os":       ov.OS,
		}, nil
	}
	if strings.TrimSpace(spec.Host) == "" {
		spec.Host = strVal(m, "host")
	}
	if spec.Port == 0 {
		spec.Port = intVal(m, 22, "port")
	}
	if spec.User == "" {
		spec.User = strVal(m, "user")
	}
	if spec.Password == "" {
		spec.Password = strVal(m, "password")
	}
	if spec.PrivateKey == "" {
		spec.PrivateKey = strVal(m, "privateKey")
	}
	if spec.Passphrase == "" {
		spec.Passphrase = strVal(m, "passphrase")
	}
	if !spec.AcceptNewHostKey {
		if v, ok := m["acceptNewHostKey"].(bool); ok {
			spec.AcceptNewHostKey = v
		}
	}
	if spec.TrustedHostKey == "" {
		spec.TrustedHostKey = strVal(m, "trustedHostKey")
	}
	if spec.Role == "" {
		spec.Role = TargetRole(strVal(m, "role"))
	}
	if spec.Via == "" {
		spec.Via = strVal(m, "via")
	}
	if spec.Jump == nil {
		if jmp, ok := m["jump"].(map[string]any); ok {
			spec.Jump = jumpFromMap(jmp)
		}
	}
	client, presented, derr := dialSSHWithKey(spec)
	if derr != nil {
		out := map[string]any{"success": false, "message": derr.Error()}
		if hk := hostKeyIssueFrom(derr); hk != nil {
			out["code"] = "hostkey_unknown"
			out["fingerprint"] = hk.Fingerprint
			out["keyType"] = hk.KeyType
			out["hostKey"] = hk.KeyB64
			if hk.Hop != "" {
				out["hop"] = hk.Hop
			}
		} else if presented != nil && (strings.Contains(derr.Error(), "HOSTKEY") || strings.TrimSpace(spec.TrustedHostKey) == "") {
			out["code"] = "hostkey_unknown"
			out["fingerprint"] = ssh.FingerprintSHA256(presented)
			out["keyType"] = presented.Type()
			out["hostKey"] = base64.StdEncoding.EncodeToString(presented.Marshal())
			out["hop"] = "target"
		}
		return out, nil
	}
	defer client.Close()
	hostOut, _ := client.run(`hostname 2>/dev/null || uname -n`)
	osOut, _ := client.run(`. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-linux}"`)
	res := map[string]any{
		"success":  true,
		"message":  "ok",
		"kind":     "ssh",
		"hostname": strings.TrimSpace(hostOut),
		"os":       strings.TrimSpace(osOut),
		"host":     spec.Host,
		"port":     spec.Port,
		"user":     spec.User,
	}
	if presented != nil {
		res["fingerprint"] = ssh.FingerprintSHA256(presented)
		res["keyType"] = presented.Type()
		res["hostKey"] = base64.StdEncoding.EncodeToString(presented.Marshal())
	}
	return res, nil
}

func (p *plugin) handleTargetsReconnect(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	ws, m, perr := p.withWorkspace(params)
	if perr != nil {
		return nil, perr
	}
	var ids []string
	if raw, ok := m["targetIds"]; ok && raw != nil {
		b, _ := json.Marshal(raw)
		_ = json.Unmarshal(b, &ids)
	}
	if len(ids) == 0 {
		if one := strVal(m, "targetId"); one != "" {
			ids = []string{one}
		}
	}
	status := ws.reconnectTargets(ids)
	return map[string]any{"ok": true, "targets": status}, nil
}

func (p *plugin) handleTargetsKeepalive(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	ws, _, perr := p.withWorkspace(params)
	if perr != nil {
		return nil, perr
	}
	return map[string]any{"ok": true, "targets": ws.keepaliveOptShells()}, nil
}

func (p *plugin) handleTargetsSync(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	ws, m, perr := p.withWorkspace(params)
	if perr != nil {
		return nil, perr
	}
	raw, _ := json.Marshal(m["targets"])
	var specs []TargetSpec
	if err := json.Unmarshal(raw, &specs); err != nil {
		return nil, dbxpluginsdk.NewError(-32602, "targets must be an array")
	}
	if len(specs) == 0 {
		specs = []TargetSpec{{ID: "localhost", DisplayName: "localhost", Kind: TargetLocal}}
	}
	syncErr := ws.syncTargets(specs)
	status := make([]map[string]any, 0, len(specs))
	for _, s := range specs {
		st := "ready"
		msg := ""
		t, err := ws.getTarget(s.ID)
		if err != nil {
			st = "failed"
			msg = err.Error()
		} else if s.Kind == TargetSSH && (t == nil || t.ssh == nil) {
			st = "failed"
			msg = "ssh not connected"
			if syncErr != nil {
				msg = syncErr.Error()
			}
		}
		status = append(status, map[string]any{"id": s.ID, "status": st, "message": msg})
	}
	res := map[string]any{"ok": true, "targets": status}
	if syncErr != nil {
		res["warning"] = syncErr.Error()
	}
	return res, nil
}

func (p *plugin) handleOverview(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	return p.withTarget(params, func(t *targetRuntime, _ map[string]any) (any, error) {
		c, err := t.collector()
		if err != nil {
			return nil, err
		}
		ov, err := c.Overview(t.spec.ID)
		if err != nil {
			return nil, err
		}
		t.recordOverview(ov)
		return ov, nil
	})
}

func (p *plugin) handleHistory(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	return p.withTarget(params, func(t *targetRuntime, m map[string]any) (any, error) {
		metric := strVal(m, "metric")
		if metric == "" {
			metric = "cpu"
		}
		samples := []HistorySample{}
		if t.ring != nil {
			samples = t.ring.snapshot(metric)
		}
		return map[string]any{"targetId": t.spec.ID, "metric": metric, "samples": samples}, nil
	})
}

func (p *plugin) handleList(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	return p.withTarget(params, func(t *targetRuntime, m map[string]any) (any, error) {
		c, err := t.collector()
		if err != nil {
			return nil, err
		}
		limit := intVal(m, 500, "limit")
		items, err := c.ListProcesses(strVal(m, "query"), limit)
		if err != nil {
			return nil, err
		}
		return map[string]any{"targetId": t.spec.ID, "items": items}, nil
	})
}

func (p *plugin) handleKill(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	return p.withTarget(params, func(t *targetRuntime, m map[string]any) (any, error) {
		pid := int32(intVal(m, 0, "pid"))
		if pid <= 1 {
			return nil, fmt.Errorf("refusing to signal protected pid")
		}
		c, err := t.collector()
		if err != nil {
			return nil, err
		}
		if err := c.Kill(pid, strVal(m, "signal")); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "pid": pid}, nil
	})
}

func (p *plugin) handleServicesList(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	return p.withTarget(params, func(t *targetRuntime, _ map[string]any) (any, error) {
		c, err := t.collector()
		if err != nil {
			return nil, err
		}
		items, err := c.ListServices()
		if err != nil {
			return map[string]any{
				"targetId":     t.spec.ID,
				"items":        []ServiceInfo{},
				"linuxCapable": false,
				"message":      err.Error(),
			}, nil
		}
		return map[string]any{"targetId": t.spec.ID, "items": items, "linuxCapable": true}, nil
	})
}

func (p *plugin) handleServicesAction(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	return p.withTarget(params, func(t *targetRuntime, m map[string]any) (any, error) {
		c, err := t.collector()
		if err != nil {
			return nil, err
		}
		unit := strVal(m, "unit")
		action := strVal(m, "action")
		if err := c.ServiceAction(unit, action); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "unit": unit, "action": action}, nil
	})
}

func (p *plugin) handleDiagnose(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	return p.withTarget(params, func(t *targetRuntime, _ map[string]any) (any, error) {
		c, err := t.collector()
		if err != nil {
			return nil, err
		}
		oomFn := func() string { return "" }
		if t.spec.Kind == TargetSSH && t.ssh != nil {
			oomFn = t.ssh.OOMSnippet
		} else if t.spec.Kind == TargetLocal && runtime.GOOS == "linux" {
			oomFn = localOOMSnippet
		}
		report, err := runDiagnose(c, t.spec.ID, oomFn)
		if err != nil {
			return nil, err
		}
		if report.Overview != nil {
			t.recordOverview(report.Overview)
		}
		return report, nil
	})
}

func (p *plugin) handleJvmSnapshot(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	return p.withTarget(params, func(t *targetRuntime, m map[string]any) (any, error) {
		c, err := t.collector()
		if err != nil {
			return nil, err
		}
		pid := int32(intVal(m, 0, "pid"))
		oomFn := func() string { return "" }
		if t.spec.Kind == TargetSSH && t.ssh != nil {
			oomFn = t.ssh.OOMSnippet
		} else if t.spec.Kind == TargetLocal && runtime.GOOS == "linux" {
			oomFn = localOOMSnippet
		}
		snap, err := runJvmSnapshot(c, t.spec.ID, pid, oomFn)
		if err != nil {
			return nil, err
		}
		return snap, nil
	})
}

func (p *plugin) handleExec(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	return p.withTarget(params, func(t *targetRuntime, m map[string]any) (any, error) {
		c, err := t.collector()
		if err != nil {
			return nil, err
		}
		cmd := strVal(m, "command", "cmd")
		res, err := c.Exec(cmd)
		if err != nil {
			return nil, err
		}
		return map[string]any{"targetId": t.spec.ID, "result": res}, nil
	})
}

func (p *plugin) handleExecBatch(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	ws, m, perr := p.withWorkspace(params)
	if perr != nil {
		return nil, perr
	}
	cmd := strVal(m, "command", "cmd")
	if _, err := sanitizeExecCommand(cmd); err != nil {
		return nil, dbxpluginsdk.NewError(-32602, err.Error())
	}
	var ids []string
	if raw, ok := m["targetIds"]; ok && raw != nil {
		b, _ := json.Marshal(raw)
		_ = json.Unmarshal(b, &ids)
	}
	if len(ids) == 0 {
		return nil, dbxpluginsdk.NewError(-32602, "targetIds is required")
	}
	if len(ids) > 40 {
		return nil, dbxpluginsdk.NewError(-32602, "too many targets (max 40)")
	}
	results := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		row := map[string]any{"targetId": id}
		t, err := ws.getTarget(id)
		if err != nil {
			row["ok"] = false
			row["error"] = err.Error()
			results = append(results, row)
			continue
		}
		c, err := t.collector()
		if err != nil {
			row["ok"] = false
			row["error"] = err.Error()
			results = append(results, row)
			continue
		}
		res, err := c.Exec(cmd)
		if err != nil {
			row["ok"] = false
			row["error"] = err.Error()
			results = append(results, row)
			continue
		}
		row["ok"] = true
		row["result"] = res
		results = append(results, row)
	}
	return map[string]any{"command": cmd, "results": results}, nil
}

func (p *plugin) handleLogs(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	return p.withTarget(params, func(t *targetRuntime, m map[string]any) (any, error) {
		c, err := t.collector()
		if err != nil {
			return nil, err
		}
		src := strVal(m, "source")
		lines := intVal(m, 100, "lines", "limit")
		res, err := c.TailLogs(src, lines)
		if err != nil {
			return nil, err
		}
		return map[string]any{"targetId": t.spec.ID, "result": res}, nil
	})
}

func (p *plugin) handleBastionDiscover(params json.RawMessage) (any, *dbxpluginsdk.PluginError) {
	ws, m, perr := p.withWorkspace(params)
	if perr != nil {
		return nil, perr
	}
	bastionID := strVal(m, "bastionId", "targetId")
	if bastionID == "" {
		return nil, dbxpluginsdk.NewError(-32602, "bastionId is required")
	}
	t, err := ws.getTarget(bastionID)
	if err != nil {
		return nil, dbxpluginsdk.NewError(-32000, err.Error())
	}
	if t.spec.Kind != TargetSSH {
		return nil, dbxpluginsdk.NewError(-32000, "bastion discover requires an SSH bastion target")
	}
	if strings.TrimSpace(t.spec.Via) != "" {
		return nil, dbxpluginsdk.NewError(-32000, "discover must run on a bastion (not a via-jump host)")
	}
	c, err := t.collector()
	if err != nil {
		return nil, dbxpluginsdk.NewError(-32000, err.Error())
	}
	sshC, ok := c.(*sshCollector)
	if !ok {
		return nil, dbxpluginsdk.NewError(-32000, "bastion not connected")
	}
	items, derr := sshC.DiscoverHosts(strVal(m, "mode"))
	if derr != nil {
		return nil, dbxpluginsdk.NewError(-32000, derr.Error())
	}
	return map[string]any{
		"bastionId": t.spec.ID,
		"items":     items,
		"count":     len(items),
	}, nil
}

func jumpFromMap(m map[string]any) *JumpSpec {
	if m == nil {
		return nil
	}
	j := &JumpSpec{
		Host:             strVal(m, "host"),
		Port:             intVal(m, 22, "port"),
		User:             strVal(m, "user"),
		Password:         strVal(m, "password"),
		PrivateKey:       strVal(m, "privateKey"),
		Passphrase:       strVal(m, "passphrase"),
		TrustedHostKey:   strVal(m, "trustedHostKey"),
		AcceptNewHostKey: false,
		BastionKind:      strVal(m, "bastionKind"),
		WebPort:          intVal(m, 801, "webPort"),
	}
	if v, ok := m["acceptNewHostKey"].(bool); ok {
		j.AcceptNewHostKey = v
	}
	if j.Host == "" {
		return nil
	}
	return j
}

func localOOMSnippet() string {
	cmd := exec.Command("bash", "-lc", `(journalctl -k -n 80 --no-pager 2>/dev/null || dmesg 2>/dev/null | tail -n 80) | grep -iE 'oom|killed process|out of memory' | tail -n 40`)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func (p *plugin) withWorkspace(params json.RawMessage) (*workspace, map[string]any, *dbxpluginsdk.PluginError) {
	m, err := decodeMap(params)
	if err != nil {
		return nil, nil, err
	}
	id := strVal(m, "connectionId")
	if id == "" {
		return nil, nil, dbxpluginsdk.NewError(-32602, "connectionId is required")
	}
	ws := p.getWorkspace(id)
	if ws == nil {
		ws = p.putWorkspace(id)
	}
	return ws, m, nil
}

func (p *plugin) withTarget(params json.RawMessage, fn func(*targetRuntime, map[string]any) (any, error)) (any, *dbxpluginsdk.PluginError) {
	ws, m, perr := p.withWorkspace(params)
	if perr != nil {
		return nil, perr
	}
	tid := strVal(m, "targetId")
	if tid == "" {
		return nil, dbxpluginsdk.NewError(-32602, "targetId is required")
	}
	t, err := ws.getTarget(tid)
	if err != nil {
		return nil, dbxpluginsdk.NewError(-32000, err.Error())
	}
	res, cerr := fn(t, m)
	if cerr != nil {
		return nil, dbxpluginsdk.NewError(-32000, cerr.Error())
	}
	return res, nil
}

func decodeMap(params json.RawMessage) (map[string]any, *dbxpluginsdk.PluginError) {
	if len(params) == 0 || string(params) == "null" {
		return map[string]any{}, nil
	}
	var m map[string]any
	if err := json.Unmarshal(params, &m); err != nil {
		return nil, dbxpluginsdk.NewError(-32602, "invalid params")
	}
	return m, nil
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
				return t
			case float64:
				return fmt.Sprintf("%.0f", t)
			case json.Number:
				return t.String()
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
			case int:
				return t
			case json.Number:
				i, _ := t.Int64()
				return int(i)
			case string:
				var n int
				fmt.Sscanf(t, "%d", &n)
				if n != 0 {
					return n
				}
			}
		}
	}
	return def
}
