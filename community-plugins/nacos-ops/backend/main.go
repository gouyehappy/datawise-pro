package main

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/datawise/community-plugin-nacos-ops/internal/rpc"
)

const (
	pluginID      = "io.datawise.community.nacos-ops"
	pluginVersion = "0.5.5"
)

type session struct {
	client *NacosClient
	cfg    ConnConfig
}

type plugin struct {
	mu        sync.Mutex
	sessions  map[string]*session
}

func (p *plugin) put(id string, s *session) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.sessions == nil {
		p.sessions = map[string]*session{}
	}
	p.sessions[id] = s
}

func (p *plugin) get(id string) *session {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.sessions[id]
}

func (p *plugin) drop(id string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.sessions, id)
}

func (p *plugin) Handle(_ rpc.RequestContext, method string, params json.RawMessage, _ *rpc.Emitter) (any, *rpc.PluginError) {
	switch method {
	case "plugin/ping":
		return map[string]any{"ok": true, "plugin": pluginID, "version": pluginVersion}, nil
	case "workbench/close":
		return map[string]any{"ok": true}, nil
	case "connection/test":
		return p.handleTest(params)
	case "connection/connect":
		return p.handleConnect(params)
	case "connection/disconnect":
		return p.handleDisconnect(params)
	case "nacos/info":
		return p.withSession(params, func(s *session, _ map[string]any) (any, error) { return s.client.Info() })
	case "nacos/namespaces":
		return p.withSession(params, func(s *session, _ map[string]any) (any, error) { return s.client.Namespaces() })
	case "nacos/namespaces/create":
		return p.withSession(params, func(s *session, m map[string]any) (any, error) {
			return s.client.NamespacesCreate(strVal(m, "id", "namespaceId"), strVal(m, "name", "namespaceName"), strVal(m, "desc", "namespaceDesc"))
		})
	case "nacos/namespaces/update":
		return p.withSession(params, func(s *session, m map[string]any) (any, error) {
			return s.client.NamespacesUpdate(strVal(m, "id", "namespaceId"), strVal(m, "name", "namespaceName"), strVal(m, "desc", "namespaceDesc"))
		})
	case "nacos/namespaces/delete":
		return p.withSession(params, func(s *session, m map[string]any) (any, error) {
			return s.client.NamespacesDelete(strVal(m, "id", "namespaceId"))
		})
	case "nacos/configs/list":
		return p.withSession(params, func(s *session, m map[string]any) (any, error) {
			return s.client.ConfigsList(
				strVal(m, "namespaceId", "namespace"),
				strVal(m, "dataId"),
				strVal(m, "group"),
				intVal(m, 200, "pageSize"),
				intVal(m, 1, "pageNo"),
			)
		})
	case "nacos/configs/get":
		return p.withSession(params, func(s *session, m map[string]any) (any, error) {
			return s.client.ConfigsGet(strVal(m, "dataId"), strVal(m, "group"), strVal(m, "namespaceId", "namespace"))
		})
	case "nacos/configs/publish":
		return p.withSession(params, func(s *session, m map[string]any) (any, error) {
			return s.client.ConfigsPublish(strVal(m, "dataId"), strVal(m, "group"), strVal(m, "namespaceId", "namespace"), strVal(m, "content"), strVal(m, "type"))
		})
	case "nacos/configs/delete":
		return p.withSession(params, func(s *session, m map[string]any) (any, error) {
			return s.client.ConfigsDelete(strVal(m, "dataId"), strVal(m, "group"), strVal(m, "namespaceId", "namespace"))
		})
	case "nacos/configs/history/list":
		return p.withSession(params, func(s *session, m map[string]any) (any, error) {
			return s.client.ConfigsHistoryList(
				strVal(m, "dataId"),
				strVal(m, "group"),
				strVal(m, "namespaceId", "namespace"),
				intVal(m, 20, "pageSize", "limit"),
				intVal(m, 1, "pageNo"),
			)
		})
	case "nacos/configs/history/get":
		return p.withSession(params, func(s *session, m map[string]any) (any, error) {
			return s.client.ConfigsHistoryGet(
				strVal(m, "dataId"),
				strVal(m, "group"),
				strVal(m, "namespaceId", "namespace"),
				strVal(m, "nid", "id"),
			)
		})
	case "nacos/services/list":
		return p.withSession(params, func(s *session, m map[string]any) (any, error) {
			return s.client.ServicesList(strVal(m, "namespaceId", "namespace"), intVal(m, 200, "pageSize"))
		})
	case "nacos/instances/list":
		return p.withSession(params, func(s *session, m map[string]any) (any, error) {
			return s.client.InstancesList(strVal(m, "serviceName"), strVal(m, "groupName", "group"), strVal(m, "namespaceId", "namespace"))
		})
	default:
		return nil, rpc.MethodNotFound(method)
	}
}

func (p *plugin) handleTest(params json.RawMessage) (any, *rpc.PluginError) {
	m, err := decodeMap(params)
	if err != nil {
		return nil, err
	}
	cfg, cerr := parseConnConfig(m)
	if cerr != nil {
		return map[string]any{"success": false, "message": cerr.Error()}, nil
	}
	client := NewNacosClient(cfg)
	if err := client.Login(); err != nil {
		return map[string]any{"success": false, "message": err.Error()}, nil
	}
	if _, err := client.Namespaces(); err != nil {
		return map[string]any{"success": false, "message": err.Error()}, nil
	}
	return map[string]any{
		"success": true,
		"message": "ok",
		"baseUrl": cfg.BaseURL,
		"v3Api":   cfg.V3API,
	}, nil
}

func (p *plugin) handleConnect(params json.RawMessage) (any, *rpc.PluginError) {
	m, err := decodeMap(params)
	if err != nil {
		return nil, err
	}
	id := strVal(m, "connectionId")
	if id == "" {
		id = strVal(asMap(m["connection"]), "id")
	}
	if id == "" {
		return nil, rpc.NewError(-32602, "connectionId is required")
	}
	cfg, cerr := parseConnConfig(m)
	if cerr != nil {
		return nil, rpc.NewError(-32000, cerr.Error())
	}
	client := NewNacosClient(cfg)
	if err := client.Login(); err != nil {
		return nil, rpc.NewError(-32000, err.Error())
	}
	if _, err := client.Namespaces(); err != nil {
		return nil, rpc.NewError(-32000, err.Error())
	}
	p.put(id, &session{client: client, cfg: cfg})
	return map[string]any{
		"success":      true,
		"connectionId": id,
		"baseUrl":      cfg.BaseURL,
		"v3Api":        cfg.V3API,
	}, nil
}

func (p *plugin) handleDisconnect(params json.RawMessage) (any, *rpc.PluginError) {
	m, err := decodeMap(params)
	if err != nil {
		return nil, err
	}
	p.drop(strVal(m, "connectionId"))
	return map[string]any{"success": true}, nil
}

func (p *plugin) withSession(params json.RawMessage, fn func(*session, map[string]any) (any, error)) (any, *rpc.PluginError) {
	m, err := decodeMap(params)
	if err != nil {
		return nil, err
	}
	id := strVal(m, "connectionId")
	s := p.get(id)
	if s == nil {
		return nil, rpc.NewError(-32000, "connection not connected: "+id)
	}
	result, ferr := fn(s, m)
	if ferr != nil {
		return nil, rpc.NewError(-32000, ferr.Error())
	}
	return result, nil
}

func decodeMap(params json.RawMessage) (map[string]any, *rpc.PluginError) {
	if len(params) == 0 || string(params) == "null" {
		return map[string]any{}, nil
	}
	var m map[string]any
	if err := json.Unmarshal(params, &m); err != nil {
		return nil, rpc.NewError(-32602, "Invalid request parameters: "+err.Error())
	}
	return m, nil
}

func main() {
	log.SetFlags(0)
	log.SetPrefix("[nacos-ops] ")
	instance := &plugin{sessions: map[string]*session{}}
	server := rpc.NewServer(rpc.Metadata{
		ID:           pluginID,
		Version:      pluginVersion,
		Capabilities: []string{"connections"},
	}, instance)
	log.Fatal(server.Serve())
}
