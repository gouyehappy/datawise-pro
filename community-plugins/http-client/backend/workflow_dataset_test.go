package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/datawise/community-plugin-http-client/internal/rpc"
)

func TestApplyDatasetRow(t *testing.T) {
	if got := applyDatasetRow(map[string]string{}, nil, 1); got != nil {
		t.Fatal("no dataset must return nil")
	}

	vars := map[string]string{"keep": "1"}
	dataset := []map[string]string{{"uid": "A"}, {"uid": "B"}}

	row1 := applyDatasetRow(vars, dataset, 1)
	if row1["uid"] != "A" || vars["uid"] != "A" || vars["keep"] != "1" {
		t.Fatalf("round 1: row=%v vars=%v", row1, vars)
	}

	// Scripts may add extra keys; the next row must not wipe them.
	vars["script"] = "yes"
	row2 := applyDatasetRow(vars, dataset, 2)
	if row2["uid"] != "B" || vars["uid"] != "B" || vars["script"] != "yes" {
		t.Fatalf("round 2 must preserve script-set vars: row=%v vars=%v", row2, vars)
	}

	row3 := applyDatasetRow(vars, dataset, 3)
	if row3["uid"] != "A" || vars["uid"] != "A" {
		t.Fatalf("rows must cycle when rounds exceed rows: row=%v vars=%v", row3, vars)
	}

	if got := applyDatasetRow(nil, dataset, 1); got["uid"] != "A" {
		t.Fatal("nil vars must not panic")
	}
}

// End-to-end: workflow/start with a dataset must resolve {{uid}} from a
// different row on each round, and round-start events must carry the row.
func TestWorkflowDatasetInjectsRowPerRound(t *testing.T) {
	var mu sync.Mutex
	seen := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		mu.Lock()
		seen = append(seen, req.URL.Query().Get("uid"))
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	p := &plugin{executor: newExecutor(), workflows: newWorkflowHub()}
	// stdio-jsonl is strictly one frame per line: marshal to a single line.
	paramsBytes, err := json.Marshal(map[string]any{
		"runId":      "ds1",
		"mode":       "rounds",
		"rounds":     2,
		"intervalMs": 0,
		"variables":  map[string]string{"uid": "base"},
		"dataset":    []map[string]string{{"uid": "A"}, {"uid": "B"}},
		"steps": []map[string]string{{
			"id": "s1", "name": "s1", "method": "GET", "url": server.URL + "/?uid={{uid}}",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}

	writer := &frameWriter{lines: make(chan string, 128)}
	frame := fmt.Sprintf(`{"jsonrpc":"2.0","id":1,"method":"workflow/start","params":%s}`, string(paramsBytes)) + "\n"
	if err := rpc.NewServer(rpc.Metadata{}, p).ServeIO(strings.NewReader(frame), writer); err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(8 * time.Second)
	for {
		mu.Lock()
		n := len(seen)
		mu.Unlock()
		if n >= 2 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("only %d requests arrived; dataset rows were not injected", n)
		}
		time.Sleep(20 * time.Millisecond)
	}
	mu.Lock()
	got := append([]string(nil), seen...)
	mu.Unlock()
	if got[0] != "A" || got[1] != "B" {
		t.Fatalf("expected uid A then B, got %v", got)
	}

	events := []string{}
	for {
		select {
		case line := <-writer.lines:
			events = append(events, line)
			continue
		default:
		}
		break
	}
	joined := strings.Join(events, "")
	if !strings.Contains(joined, `"datasetRow"`) || !strings.Contains(joined, `"uid":"B"`) {
		t.Fatalf("round-start events missing datasetRow: %s", joined)
	}
}
