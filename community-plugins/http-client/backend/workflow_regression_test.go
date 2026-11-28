package main

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// Regression: an invalid authStepId used to return while holding the hub lock,
// permanently deadlocking every workflow/* RPC.
func TestWorkflowStartInvalidAuthStepDoesNotDeadlock(t *testing.T) {
	p := &plugin{workflows: newWorkflowHub()}
	params := json.RawMessage(`{
		"runId":"r1","mode":"once","authStepId":"missing",
		"steps":[{"id":"s1","name":"s1","method":"GET","url":"http://example.com"}]
	}`)
	if _, rpcErr := p.handleWorkflowStart(params, nil); rpcErr == nil {
		t.Fatal("expected invalid authStepId to be rejected")
	}
	done := make(chan struct{})
	go func() {
		p.handleWorkflowStatus(nil)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("workflow hub deadlocked after invalid authStepId")
	}
}

func TestRunScriptFailingExpectMarksResultFailed(t *testing.T) {
	vars := map[string]string{}
	res := runScript(`
		pm.test("status is 500", function () {
			pm.expect(pm.response.code).to.eql(500);
		});
	`, vars, &scriptResponse{Status: 200}, nil)
	if res.OK {
		t.Fatal("failing pm.test must set scriptResult.OK=false")
	}
	if len(res.Tests) != 1 || res.Tests[0].OK {
		t.Fatalf("expected one failed test, got %+v", res.Tests)
	}
}

func TestRunScriptPassingExpectAndAssert(t *testing.T) {
	vars := map[string]string{}
	res := runScript(`
		pm.test("happy path", function () {
			pm.expect(pm.response.code).to.eql(200);
			pm.expect("abc").a("string");
			pm.expect(1).to.be.ok();
			pm.assert("1 + 1 === 2");
		});
	`, vars, &scriptResponse{Status: 200}, nil)
	if !res.OK {
		t.Fatalf("expected passing assertions, got error=%q logs=%v", res.Error, res.Logs)
	}
	if len(res.Tests) != 2 {
		t.Fatalf("expected 2 recorded tests, got %+v", res.Tests)
	}
}

func TestRunScriptTimeout(t *testing.T) {
	start := time.Now()
	res := runScript(`while (true) {}`, map[string]string{}, nil, nil)
	if res.OK {
		t.Fatal("infinite loop must be interrupted")
	}
	if !strings.Contains(res.Error, "timed out") {
		t.Fatalf("expected timeout error, got %q", res.Error)
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Fatalf("timeout took too long: %s", elapsed)
	}
}

func TestFailedTestMessage(t *testing.T) {
	message := failedTestMessage([]scriptTest{
		{Name: "pass", OK: true},
		{Name: "status", OK: false, Message: "expected 200 but got 500"},
	})
	if !strings.Contains(message, "status") || !strings.Contains(message, "expected 200") {
		t.Fatalf("unexpected failure message: %q", message)
	}
}
