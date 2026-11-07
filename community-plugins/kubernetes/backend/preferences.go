package main

import (
	"encoding/json"
	"github.com/datawise-community/kubernetes/internal/rpc"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type preferenceStore struct {
	mu     sync.Mutex
	path   string
	values map[string]map[string]string
}

func (p *plugin) handlePreferences(method string, v map[string]any, raw json.RawMessage) (any, *rpc.PluginError) {
	id, _ := v["connectionId"].(string)
	if strings.TrimSpace(id) == "" {
		return nil, rpc.NewError(-32602, "connectionId is required")
	}
	s := &p.preferences
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.values == nil {
		if s.path == "" {
			path, e := pluginDataFile("preferences.json")
			if e != nil {
				return nil, classify(e)
			}
			s.path = path
		}
		s.values = map[string]map[string]string{}
		if b, e := os.ReadFile(s.path); e == nil {
			_ = json.Unmarshal(b, &s.values)
		}
	}
	if method == "ui/preferences-set" {
		var q struct {
			Key   string  `json:"key"`
			Value *string `json:"value"`
		}
		if json.Unmarshal(raw, &q) == nil && q.Key != "" {
			if s.values[id] == nil {
				s.values[id] = map[string]string{}
			}
			if q.Value == nil {
				delete(s.values[id], q.Key)
			} else {
				s.values[id][q.Key] = *q.Value
			}
			b, e := json.Marshal(s.values)
			if e != nil {
				return nil, classify(e)
			}
			if e = os.MkdirAll(filepath.Dir(s.path), 0700); e != nil {
				return nil, classify(e)
			}
			f, e := os.CreateTemp(filepath.Dir(s.path), "preferences-*.tmp")
			if e != nil {
				return nil, classify(e)
			}
			name := f.Name()
			defer os.Remove(name)
			if _, e = f.Write(b); e == nil {
				e = f.Sync()
			}
			if ce := f.Close(); e == nil {
				e = ce
			}
			if e == nil {
				e = os.Chmod(name, 0600)
			}
			if e == nil {
				e = os.Rename(name, s.path)
			}
			if e != nil {
				return nil, classify(e)
			}
		}
	}
	return map[string]any{"values": s.values[id]}, nil
}
