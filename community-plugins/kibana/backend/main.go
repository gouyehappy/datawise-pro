// Command datawise-plugin-kibana is the native sidecar of the DataWise
// "Kibana Logs" community workbench plugin.
//
// The sandboxed plugin UI cannot open sockets on its own, so Elasticsearch
// traffic travels over stdio-jsonl JSON-RPC to this process, which forwards
// requests through Kibana / OpenSearch Dashboards console proxy.
package main

import (
	"encoding/json"
	"log"
	"strings"

	"github.com/datawise/community-plugin-kibana/internal/rpc"
)

const (
	pluginID      = "io.datawise.community.kibana"
	pluginVersion = "0.3.0"
)

type plugin struct {
	connections *connectionManager
}

func (p *plugin) Handle(
	_ rpc.RequestContext,
	method string,
	params json.RawMessage,
	_ *rpc.Emitter,
) (any, *rpc.PluginError) {
	v := map[string]any{}
	if len(params) > 0 && string(params) != "null" {
		if err := json.Unmarshal(params, &v); err != nil {
			return nil, rpc.NewError(-32602, "invalid JSON parameters")
		}
	}
	switch method {
	case "plugin/ping":
		return map[string]any{
			"ok":      true,
			"plugin":  pluginID,
			"version": pluginVersion,
		}, nil
	case "workbench/close":
		return map[string]any{"ok": true}, nil
	case "connection/test":
		return p.handleConnectionTest(v)
	case "connection/connect":
		return p.handleConnectionConnect(v)
	case "connection/disconnect":
		return p.handleConnectionDisconnect(v)
	case "kibana/indices":
		return p.handleIndices(v)
	case "kibana/search":
		return p.handleSearch(v)
	case "kibana/doc":
		return p.handleDoc(v)
	case "kibana/discoverUrl":
		return p.handleDiscoverURL(v)
	default:
		return nil, rpc.MethodNotFound(method)
	}
}

func (p *plugin) handleConnectionTest(v map[string]any) (any, *rpc.PluginError) {
	cfg, err := Resolve(v)
	if err != nil {
		return map[string]any{"success": false, "message": err.Error()}, nil
	}
	client := NewClient(cfg)
	defer client.Close()
	probe, err := client.Probe()
	if err != nil {
		return map[string]any{"success": false, "message": err.Error()}, nil
	}
	if !probe.OK {
		return map[string]any{
			"success":  false,
			"message":  probe.Message,
			"basePath": probe.BasePath,
			"spaceId":  probe.SpaceID,
		}, nil
	}
	return map[string]any{
		"success":    true,
		"message":    probe.Message,
		"basePath":   probe.BasePath,
		"spaceId":    probe.SpaceID,
		"transport":  probe.Transport,
		"version":    probe.Version,
		"kibanaName": probe.KibanaName,
	}, nil
}

func (p *plugin) handleConnectionConnect(v map[string]any) (any, *rpc.PluginError) {
	cfg, err := Resolve(v)
	if err != nil {
		return nil, rpc.NewError(-32602, err.Error())
	}
	if cfg.ID == "" {
		return nil, rpc.NewError(-32602, "missing connection id")
	}
	client := NewClient(cfg)
	probe, err := client.Probe()
	if err != nil {
		client.Close()
		return nil, rpc.NewError(-32000, err.Error())
	}
	if !probe.OK {
		client.Close()
		return nil, rpc.NewError(-32000, probe.Message)
	}
	// Persist detected base path / space / transport onto the live config.
	if probe.BasePath != "" {
		cfg.KibanaBasePath = probe.BasePath
	}
	if probe.SpaceID != "" {
		cfg.SpaceID = probe.SpaceID
	}
	if probe.Transport != "" {
		cfg.Transport = probe.Transport
	}
	p.connections.putClient(cfg, client)
	info := p.connections.info(cfg)
	info["message"] = probe.Message
	info["transport"] = probe.Transport
	info["version"] = probe.Version
	return info, nil
}

func (p *plugin) handleConnectionDisconnect(v map[string]any) (any, *rpc.PluginError) {
	id := connectionID(v)
	if id == "" {
		return nil, rpc.NewError(-32602, "missing connectionId")
	}
	p.connections.remove(id)
	return map[string]any{"success": true}, nil
}

func (p *plugin) handleDiscoverURL(v map[string]any) (any, *rpc.PluginError) {
	client, cfg, err := p.clientFor(v)
	if err != nil {
		// Fall back to resolving without a live client (URL only).
		resolved, resolveErr := Resolve(v)
		if resolveErr != nil {
			return nil, err
		}
		cfg = resolved
		client = NewClient(cfg)
		defer client.Close()
	}
	// Refresh base path / space from live redirect when possible.
	_, _ = client.Probe()
	if cfg.KibanaBasePath == "" && client.cfg.KibanaBasePath != "" {
		cfg.KibanaBasePath = client.cfg.KibanaBasePath
	}
	if cfg.SpaceID == "" && client.cfg.SpaceID != "" {
		cfg.SpaceID = client.cfg.SpaceID
	}
	url := buildDiscoverURL(cfg)
	return map[string]any{
		"url":      url,
		"basePath": cfg.KibanaBasePath,
		"spaceId":  cfg.SpaceID,
		"target":   cfg.BaseURL + cfg.KibanaBasePath,
	}, nil
}

func buildDiscoverURL(cfg *Config) string {
	root := strings.TrimRight(cfg.BaseURL+cfg.KibanaBasePath, "/")
	space := strings.Trim(strings.TrimSpace(cfg.SpaceID), "/")
	path := root
	if space != "" {
		path = root + "/s/" + space
	}
	// Kibana 7.x classic Discover lives under app/kibana#/discover.
	// Newer Kibana / OSD also accept /app/discover — classic hash still works on 7.3.
	return path + "/app/kibana#/discover"
}

func (p *plugin) handleIndices(v map[string]any) (any, *rpc.PluginError) {
	client, _, err := p.clientFor(v)
	if err != nil {
		return nil, err
	}
	indices, listErr := listIndices(client)
	if listErr != nil {
		return nil, rpc.NewError(-32000, listErr.Error())
	}
	return map[string]any{"indices": indices}, nil
}

func (p *plugin) handleSearch(v map[string]any) (any, *rpc.PluginError) {
	client, cfg, err := p.clientFor(v)
	if err != nil {
		return nil, err
	}
	params := parseSearchParams(v, cfg)
	if params.From == "" && params.To == "" {
		params.From, params.To = defaultTimeRange()
	}
	result, searchErr := searchLogs(client, params)
	if searchErr != nil {
		return nil, rpc.NewError(-32000, searchErr.Error())
	}
	return result, nil
}

func (p *plugin) handleDoc(v map[string]any) (any, *rpc.PluginError) {
	client, _, err := p.clientFor(v)
	if err != nil {
		return nil, err
	}
	doc, docErr := getDocument(client, text(v["index"]), text(v["id"]))
	if docErr != nil {
		return nil, rpc.NewError(-32000, docErr.Error())
	}
	return doc, nil
}

func (p *plugin) clientFor(v map[string]any) (*Client, *Config, *rpc.PluginError) {
	id := connectionID(v)
	client, cfg, err := p.connections.get(id)
	if err != nil {
		// Allow ephemeral one-shot when host sends full connection payload without prior connect.
		resolved, resolveErr := Resolve(v)
		if resolveErr != nil {
			return nil, nil, rpc.NewError(-32000, err.Error())
		}
		client = NewClient(resolved)
		return client, resolved, nil
	}
	return client, cfg, nil
}

func main() {
	instance := &plugin{connections: newConnectionManager()}
	metadata := rpc.Metadata{
		ID:           pluginID,
		Version:      pluginVersion,
		Capabilities: []string{"connections", "kibana", "logs", "events"},
	}
	server := rpc.NewServer(metadata, instance)
	if err := server.Serve(); err != nil {
		log.Fatal(err)
	}
}
