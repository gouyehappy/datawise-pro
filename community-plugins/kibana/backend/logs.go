package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

type indexInfo struct {
	Name          string `json:"name"`
	Health        string `json:"health,omitempty"`
	Status        string `json:"status,omitempty"`
	DocsCount     string `json:"docsCount,omitempty"`
	StoreSize     string `json:"storeSize,omitempty"`
	PrimaryShards string `json:"primaryShards,omitempty"`
	Kind          string `json:"kind,omitempty"` // index | index-pattern
}

type searchHit struct {
	Index     string          `json:"index"`
	ID        string          `json:"id"`
	Score     any             `json:"score,omitempty"`
	Timestamp string          `json:"timestamp,omitempty"`
	Message   string          `json:"message,omitempty"`
	Level     string          `json:"level,omitempty"`
	Source    json.RawMessage `json:"source"`
}

type histBucket struct {
	KeyAsString string `json:"keyAsString"`
	Key         any    `json:"key"`
	DocCount    int64  `json:"docCount"`
}

type searchResult struct {
	Took         int          `json:"took"`
	TimedOut     bool         `json:"timedOut"`
	Total        any          `json:"total"`
	Hits         []searchHit  `json:"hits"`
	IndexPattern string       `json:"indexPattern"`
	Histogram    []histBucket `json:"histogram,omitempty"`
	Fields       []string     `json:"fields,omitempty"`
	TimeField    string       `json:"timeField,omitempty"`
	FromTime     string       `json:"fromTime,omitempty"`
	ToTime       string       `json:"toTime,omitempty"`
}

func listIndices(client *Client) ([]indexInfo, error) {
	// Prefer Kibana index patterns (works on Kibana 7.x where _cat/indices is blocked).
	patterns, err := listIndexPatterns(client)
	if err == nil && len(patterns) > 0 {
		return patterns, nil
	}
	raw, _, catErr := client.RequestJSON("GET", "/_cat/indices?format=json&h=index,health,status,docs.count,store.size,pri&s=index:asc", nil)
	if catErr != nil {
		if err != nil {
			return nil, fmt.Errorf("list index patterns: %v; cat indices: %w", err, catErr)
		}
		return nil, catErr
	}
	var rows []map[string]any
	if err := json.Unmarshal(raw, &rows); err != nil {
		return nil, fmt.Errorf("parse indices: %w", err)
	}
	out := make([]indexInfo, 0, len(rows))
	for _, row := range rows {
		name := text(row["index"])
		if name == "" || strings.HasPrefix(name, ".") {
			continue
		}
		out = append(out, indexInfo{
			Name:          name,
			Health:        text(row["health"]),
			Status:        text(row["status"]),
			DocsCount:     text(row["docs.count"]),
			StoreSize:     text(row["store.size"]),
			PrimaryShards: text(row["pri"]),
			Kind:          "index",
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func listIndexPatterns(client *Client) ([]indexInfo, error) {
	path := "/api/saved_objects/_find?type=index-pattern&fields=title&per_page=200"
	resp, err := client.KibanaAPI("GET", path, nil)
	if err != nil {
		return nil, err
	}
	if resp.Status < 200 || resp.Status >= 300 {
		return nil, fmt.Errorf("saved_objects find failed (%d): %s", resp.Status, truncate(resp.Body, 200))
	}
	var parsed struct {
		SavedObjects []struct {
			Attributes struct {
				Title string `json:"title"`
			} `json:"attributes"`
		} `json:"saved_objects"`
	}
	if err := json.Unmarshal([]byte(resp.Body), &parsed); err != nil {
		return nil, err
	}
	out := make([]indexInfo, 0, len(parsed.SavedObjects))
	seen := map[string]struct{}{}
	for _, obj := range parsed.SavedObjects {
		title := strings.TrimSpace(obj.Attributes.Title)
		if title == "" {
			continue
		}
		if _, ok := seen[title]; ok {
			continue
		}
		seen[title] = struct{}{}
		out = append(out, indexInfo{Name: title, Kind: "index-pattern"})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

type searchParams struct {
	ConnectionID string
	Index        string
	Query        string
	TimeField    string
	From         string
	To           string
	Size         int
	FromOffset   int
	SortOrder    string
}

func parseSearchParams(v map[string]any, cfg *Config) searchParams {
	index := text(v["index"])
	if index == "" {
		index = text(v["indexPattern"])
	}
	if index == "" && cfg != nil {
		index = cfg.DefaultIndex
	}
	if index == "" {
		index = "logs-*"
	}
	timeField := text(v["timeField"])
	if timeField == "" {
		timeField = "@timestamp"
	}
	size := numberAsInt(v["size"], 50)
	if size < 1 {
		size = 1
	}
	if size > 500 {
		size = 500
	}
	fromOffset := numberAsInt(v["fromOffset"], 0)
	if fromOffset == 0 {
		if raw, ok := v["from"]; ok {
			if _, isStr := raw.(string); !isStr {
				fromOffset = numberAsInt(raw, 0)
			}
		}
	}
	if fromOffset < 0 {
		fromOffset = 0
	}
	sortOrder := strings.ToLower(text(v["sortOrder"]))
	if sortOrder != "asc" {
		sortOrder = "desc"
	}
	return searchParams{
		ConnectionID: connectionID(v),
		Index:        index,
		Query:        text(v["query"]),
		TimeField:    timeField,
		From:         text(v["fromTime"]),
		To:           text(v["toTime"]),
		Size:         size,
		FromOffset:   fromOffset,
		SortOrder:    sortOrder,
	}
}

func executeSearch(client *Client, index string, body map[string]any) (json.RawMessage, error) {
	var raw json.RawMessage
	var err error
	if client.Mode() == TransportElasticsearchProxy || client.Mode() == TransportAuto {
		raw, err = client.MSearch(index, body)
		if err != nil && client.Mode() == TransportAuto {
			path := "/" + strings.Trim(index, "/") + "/_search"
			raw, _, err = client.RequestJSON("POST", path, body)
		}
		if err == nil && client.Mode() == TransportAuto {
			client.mode = TransportElasticsearchProxy
		}
		return raw, err
	}
	path := "/" + strings.Trim(index, "/") + "/_search"
	raw, _, err = client.RequestJSON("POST", path, body)
	return raw, err
}

func buildSearchBody(p searchParams) map[string]any {
	must := make([]any, 0, 3)
	q := strings.TrimSpace(p.Query)
	if q == "" || q == "*" {
		must = append(must, map[string]any{"match_all": map[string]any{}})
	} else {
		must = append(must, map[string]any{
			"query_string": map[string]any{
				"query":            q,
				"analyze_wildcard": true,
				"default_field":    "*",
			},
		})
	}
	if p.From != "" || p.To != "" {
		rangeBody := map[string]any{}
		if p.From != "" {
			rangeBody["gte"] = p.From
		}
		if p.To != "" {
			rangeBody["lte"] = p.To
		}
		rangeBody["format"] = "strict_date_optional_time"
		must = append(must, map[string]any{
			"range": map[string]any{
				p.TimeField: rangeBody,
			},
		})
	}
	interval := histogramInterval(p.From, p.To)
	return map[string]any{
		"from": p.FromOffset,
		"size": p.Size,
		"sort": []any{
			map[string]any{
				p.TimeField: map[string]any{"order": p.SortOrder, "unmapped_type": "date"},
			},
		},
		"query": map[string]any{
			"bool": map[string]any{"must": must},
		},
		"track_total_hits": true,
		"aggs": map[string]any{
			"discover_histogram": map[string]any{
				"date_histogram": map[string]any{
					// Use legacy "interval" for Elasticsearch 7.3 compatibility.
					"field":         p.TimeField,
					"interval":      interval,
					"min_doc_count": 0,
				},
			},
		},
	}
}

func histogramInterval(from, to string) string {
	start, err1 := time.Parse(time.RFC3339Nano, from)
	if err1 != nil {
		start, err1 = time.Parse(time.RFC3339, from)
	}
	end, err2 := time.Parse(time.RFC3339Nano, to)
	if err2 != nil {
		end, err2 = time.Parse(time.RFC3339, to)
	}
	if err1 != nil || err2 != nil || !end.After(start) {
		return "1m"
	}
	dur := end.Sub(start)
	switch {
	case dur <= 30*time.Minute:
		return "30s"
	case dur <= 3*time.Hour:
		return "1m"
	case dur <= 12*time.Hour:
		return "5m"
	case dur <= 48*time.Hour:
		return "30m"
	case dur <= 14*24*time.Hour:
		return "3h"
	default:
		return "12h"
	}
}

func searchLogs(client *Client, p searchParams) (*searchResult, error) {
	body := buildSearchBody(p)
	raw, err := executeSearch(client, p.Index, body)
	if err != nil {
		// Retry without histogram if date_histogram/field mapping rejects the request.
		bodyNoAggs := buildSearchBody(p)
		delete(bodyNoAggs, "aggs")
		raw, err = executeSearch(client, p.Index, bodyNoAggs)
		if err != nil {
			return nil, err
		}
	}

	// _msearch wraps the response: { responses: [ { hits... } ] }
	var asMSearch struct {
		Responses []json.RawMessage `json:"responses"`
	}
	searchRaw := raw
	if err := json.Unmarshal(raw, &asMSearch); err == nil && len(asMSearch.Responses) > 0 {
		searchRaw = asMSearch.Responses[0]
		var maybeErr struct {
			Error  json.RawMessage `json:"error"`
			Status int             `json:"status"`
		}
		if json.Unmarshal(searchRaw, &maybeErr) == nil && len(maybeErr.Error) > 0 && string(maybeErr.Error) != "null" {
			return nil, fmt.Errorf("search error: %s", truncate(string(maybeErr.Error), 400))
		}
	}

	var parsed struct {
		Took     int  `json:"took"`
		TimedOut bool `json:"timed_out"`
		Hits     struct {
			Total json.RawMessage `json:"total"`
			Hits  []struct {
				Index  string          `json:"_index"`
				ID     string          `json:"_id"`
				Score  any             `json:"_score"`
				Source json.RawMessage `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
		Aggregations struct {
			DiscoverHistogram struct {
				Buckets []struct {
					KeyAsString string `json:"key_as_string"`
					Key         any    `json:"key"`
					DocCount    int64  `json:"doc_count"`
				} `json:"buckets"`
			} `json:"discover_histogram"`
		} `json:"aggregations"`
	}
	if err := json.Unmarshal(searchRaw, &parsed); err != nil {
		return nil, fmt.Errorf("parse search: %w", err)
	}
	var total any
	_ = json.Unmarshal(parsed.Hits.Total, &total)
	hits := make([]searchHit, 0, len(parsed.Hits.Hits))
	fieldSet := map[string]struct{}{}
	for _, h := range parsed.Hits.Hits {
		src := map[string]any{}
		_ = json.Unmarshal(h.Source, &src)
		collectFields("", src, fieldSet)
		hits = append(hits, searchHit{
			Index:     h.Index,
			ID:        h.ID,
			Score:     h.Score,
			Timestamp: pickString(src, p.TimeField, "timestamp", "@timestamp", "time", "datetime", "time1", "time2"),
			Message: pickString(src, "message", "msg", "log", "log.original", "event.original",
				"errorMessage", "extData3", "respText"),
			Level:  pickString(src, "level", "log.level", "severity", "log.severity"),
			Source: h.Source,
		})
	}
	fields := make([]string, 0, len(fieldSet))
	for f := range fieldSet {
		fields = append(fields, f)
	}
	sort.Strings(fields)
	hist := make([]histBucket, 0, len(parsed.Aggregations.DiscoverHistogram.Buckets))
	for _, b := range parsed.Aggregations.DiscoverHistogram.Buckets {
		hist = append(hist, histBucket{
			KeyAsString: b.KeyAsString,
			Key:         b.Key,
			DocCount:    b.DocCount,
		})
	}
	return &searchResult{
		Took:         parsed.Took,
		TimedOut:     parsed.TimedOut,
		Total:        total,
		Hits:         hits,
		IndexPattern: p.Index,
		Histogram:    hist,
		Fields:       fields,
		TimeField:    p.TimeField,
		FromTime:     p.From,
		ToTime:       p.To,
	}, nil
}

func collectFields(prefix string, src map[string]any, out map[string]struct{}) {
	for key, val := range src {
		path := key
		if prefix != "" {
			path = prefix + "." + key
		}
		switch typed := val.(type) {
		case map[string]any:
			collectFields(path, typed, out)
		default:
			out[path] = struct{}{}
		}
	}
}

func getDocument(client *Client, index, id string) (map[string]any, error) {
	index = strings.Trim(index, "/")
	id = strings.TrimSpace(id)
	if index == "" || id == "" {
		return nil, fmt.Errorf("index and id are required")
	}
	// Kibana 7 elasticsearch proxy often blocks GET /_doc; fall back to search by ids.
	body := map[string]any{
		"size":  1,
		"query": map[string]any{"ids": map[string]any{"values": []string{id}}},
	}
	if client.Mode() == TransportElasticsearchProxy || client.Mode() == TransportAuto {
		raw, err := client.MSearch(index, body)
		if err != nil {
			return nil, err
		}
		var wrapped struct {
			Responses []map[string]any `json:"responses"`
		}
		if err := json.Unmarshal(raw, &wrapped); err != nil {
			return nil, err
		}
		if len(wrapped.Responses) == 0 {
			return nil, fmt.Errorf("document not found")
		}
		return wrapped.Responses[0], nil
	}
	path := fmt.Sprintf("/%s/_doc/%s", index, url.PathEscape(id))
	raw, status, err := client.RequestJSON("GET", path, nil)
	if err != nil {
		return nil, err
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	doc["_httpStatus"] = status
	return doc, nil
}

func pickString(src map[string]any, keys ...string) string {
	for _, key := range keys {
		if v, ok := dig(src, key); ok {
			if s := text(v); s != "" && s != "null" {
				return s
			}
		}
	}
	return ""
}

func dig(src map[string]any, dotted string) (any, bool) {
	if v, ok := src[dotted]; ok {
		return v, true
	}
	parts := strings.Split(dotted, ".")
	var cur any = src
	for _, part := range parts {
		m, ok := cur.(map[string]any)
		if !ok {
			return nil, false
		}
		cur, ok = m[part]
		if !ok {
			return nil, false
		}
	}
	return cur, true
}

func defaultTimeRange() (from, to string) {
	now := time.Now().UTC()
	return now.Add(-15 * time.Minute).Format(time.RFC3339Nano), now.Format(time.RFC3339Nano)
}
