package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/datawise/community-plugin-http-client/internal/rpc"
)

func TestRetryOnStatusThenSucceed(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls < 3 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	spec := &sendRequest{
		RequestID: "retry-test",
		Method:    http.MethodGet,
		URL:       server.URL,
		Options: requestOptions{
			TimeoutMs:      5000,
			MaxBodyBytes:   1 << 20,
			ProxyMode:      "direct",
			FollowRedirect: boolPtr(true),
			VerifyTLS:      boolPtr(true),
			RetryCount:     2,
			RetryBackoffMs: 1,
			RetryStatuses:  []int{500},
		},
	}
	result := newExecutor().execute(spec, rpc.DiscardEmitter())
	if calls != 3 {
		t.Fatalf("expected 3 attempts, got %d", calls)
	}
	if result.Error != nil || result.Status != http.StatusOK {
		t.Fatalf("expected success after retry, status=%d error=%v", result.Status, result.Error)
	}
	if len(result.Attempts) != 3 {
		t.Fatalf("expected 3 attempt records, got %+v", result.Attempts)
	}
	if result.Attempts[0].Status != 500 || result.Attempts[2].Status != 200 {
		t.Fatalf("unexpected attempt statuses: %+v", result.Attempts)
	}
}

func TestRetryDisabledByDefault(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	spec := &sendRequest{
		RequestID: "no-retry",
		Method:    http.MethodGet,
		URL:       server.URL,
		Options: requestOptions{
			TimeoutMs: 5000, MaxBodyBytes: 1 << 20, ProxyMode: "direct",
			FollowRedirect: boolPtr(true), VerifyTLS: boolPtr(true),
		},
	}
	result := newExecutor().execute(spec, rpc.DiscardEmitter())
	if calls != 1 {
		t.Fatalf("expected a single attempt, got %d", calls)
	}
	if len(result.Attempts) != 1 {
		t.Fatalf("expected one attempt record, got %+v", result.Attempts)
	}
}
