package main

import (
	"fmt"
	"strings"
	"sync"
)

type targetRuntime struct {
	spec   TargetSpec
	local  *localCollector
	ssh    *sshCollector
	ring   *metricRing
}

type workspace struct {
	mu      sync.Mutex
	targets map[string]*targetRuntime
}

type plugin struct {
	mu        sync.Mutex
	sessions  map[string]*workspace
}

func newPlugin() *plugin {
	return &plugin{sessions: map[string]*workspace{}}
}

func (p *plugin) putWorkspace(id string) *workspace {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.sessions == nil {
		p.sessions = map[string]*workspace{}
	}
	ws, ok := p.sessions[id]
	if !ok {
		ws = &workspace{targets: map[string]*targetRuntime{}}
		p.sessions[id] = ws
	}
	return ws
}

func (p *plugin) getWorkspace(id string) *workspace {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.sessions[id]
}

func (p *plugin) dropWorkspace(id string) {
	p.mu.Lock()
	ws := p.sessions[id]
	delete(p.sessions, id)
	p.mu.Unlock()
	if ws != nil {
		ws.closeAll()
	}
}

func (w *workspace) closeAll() {
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, t := range w.targets {
		if t.ssh != nil {
			t.ssh.Close()
		}
	}
	w.targets = map[string]*targetRuntime{}
}

func jumpEndpointEqual(a, b *JumpSpec) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return a.Host == b.Host && a.Port == b.Port && a.User == b.User &&
		a.Password == b.Password && a.PrivateKey == b.PrivateKey &&
		a.TrustedHostKey == b.TrustedHostKey && a.BastionKind == b.BastionKind
}

func (w *workspace) syncTargets(specs []TargetSpec) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Direct / bastion first, then via-jump hosts (each dial is independent ProxyJump).
	ordered := make([]TargetSpec, 0, len(specs))
	var viaSpecs []TargetSpec
	for _, s := range specs {
		if strings.TrimSpace(s.Via) != "" {
			viaSpecs = append(viaSpecs, s)
		} else {
			ordered = append(ordered, s)
		}
	}
	ordered = append(ordered, viaSpecs...)

	next := map[string]*targetRuntime{}
	var firstErr error
	for _, spec := range ordered {
		if spec.ID == "" {
			continue
		}
		if existing, ok := w.targets[spec.ID]; ok {
			same := existing.spec.Kind == spec.Kind &&
				existing.spec.Host == spec.Host &&
				existing.spec.Port == spec.Port &&
				existing.spec.User == spec.User &&
				existing.spec.Password == spec.Password &&
				existing.spec.PrivateKey == spec.PrivateKey &&
				existing.spec.TrustedHostKey == spec.TrustedHostKey &&
				existing.spec.Via == spec.Via &&
				existing.spec.MenuID == spec.MenuID &&
				existing.spec.BastionKind == spec.BastionKind &&
				jumpEndpointEqual(existing.spec.Jump, spec.Jump)
			if same {
				existing.spec = spec
				next[spec.ID] = existing
				delete(w.targets, spec.ID)
				continue
			}
			if existing.ssh != nil {
				existing.ssh.Close()
			}
		}
		rt := &targetRuntime{spec: spec, ring: newMetricRing()}
		switch spec.Kind {
		case TargetSSH:
			client, err := dialSSH(spec)
			if err != nil {
				if firstErr == nil {
					firstErr = fmt.Errorf("%s: %w", spec.ID, err)
				}
				rt.ssh = nil
			} else {
				rt.ssh = client
			}
		default:
			rt.local = &localCollector{}
			rt.spec.Kind = TargetLocal
		}
		next[spec.ID] = rt
	}
	for _, old := range w.targets {
		if old.ssh != nil {
			old.ssh.Close()
		}
	}
	w.targets = next
	return firstErr
}

func (w *workspace) getTarget(id string) (*targetRuntime, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	t, ok := w.targets[id]
	if !ok {
		return nil, fmt.Errorf("unknown targetId %q - sync targets first", id)
	}
	return t, nil
}

// reconnectTargets force-redials SSH collectors for the given ids.
// When ids is empty, only dead / missing SSH sessions are redialed.
func (w *workspace) reconnectTargets(ids []string) []map[string]any {
	w.mu.Lock()
	defer w.mu.Unlock()

	want := map[string]bool{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" {
			want[id] = true
		}
	}
	forceList := len(want) > 0
	out := make([]map[string]any, 0)
	for id, rt := range w.targets {
		if rt == nil || rt.spec.Kind != TargetSSH {
			continue
		}
		dead := rt.ssh == nil || !rt.ssh.alive()
		if forceList {
			if !want[id] {
				continue
			}
		} else if !dead {
			continue
		}
		if rt.ssh != nil {
			rt.ssh.Close()
			rt.ssh = nil
		}
		client, err := dialSSH(rt.spec)
		st := "ready"
		msg := ""
		if err != nil {
			st = "failed"
			msg = err.Error()
			rt.ssh = nil
		} else {
			rt.ssh = client
		}
		out = append(out, map[string]any{"id": id, "status": st, "message": msg})
	}
	return out
}

// keepaliveOptShells pings JumpServer interactive shells so Opt> sessions stay warm.
func (w *workspace) keepaliveOptShells() []map[string]any {
	w.mu.Lock()
	list := make([]*targetRuntime, 0)
	for _, rt := range w.targets {
		if rt != nil && rt.ssh != nil && rt.ssh.optMode {
			list = append(list, rt)
		}
	}
	w.mu.Unlock()

	out := make([]map[string]any, 0, len(list))
	for _, rt := range list {
		ok := true
		msg := "ok"
		if err := rt.ssh.keepalive(); err != nil {
			ok = false
			msg = err.Error()
		}
		out = append(out, map[string]any{"id": rt.spec.ID, "ok": ok, "message": msg})
	}
	return out
}

func (t *targetRuntime) collector() (collector, error) {
	if t.spec.Kind == TargetSSH {
		if t.ssh == nil {
			return nil, fmt.Errorf("ssh target not connected")
		}
		return t.ssh, nil
	}
	if t.local == nil {
		t.local = &localCollector{}
	}
	return t.local, nil
}

func (t *targetRuntime) recordOverview(ov *Overview) {
	if ov == nil || t.ring == nil {
		return
	}
	t.ring.push(ov.CPUPercent, ov.MemPercent, ov.Load1)
}
