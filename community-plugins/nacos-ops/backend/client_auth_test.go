package main

import "testing"

func TestExtractTokenNested(t *testing.T) {
	tok := extractToken([]byte(`{"data":{"accessToken":"abc"}}`))
	if tok != "abc" {
		t.Fatalf("got %q", tok)
	}
}

func TestExtractTokenFlat(t *testing.T) {
	tok := extractToken([]byte(`{"accessToken":"xyz"}`))
	if tok != "xyz" {
		t.Fatalf("got %q", tok)
	}
}

func TestLoginBizErrorMissingTokenBody(t *testing.T) {
	if err := loginBizError([]byte(`{"code":500,"message":"user not found"}`)); err == nil {
		t.Fatal("expected error")
	}
}

func TestLoginBizErrorOK(t *testing.T) {
	if err := loginBizError([]byte(`{"accessToken":"t","tokenTtl":18000}`)); err != nil {
		t.Fatal(err)
	}
}

func TestLoginRequiresToken(t *testing.T) {
	// Empty body must not count as authenticated login when username is set —
	// covered by Login() empty-token branch; here we assert helpers alone.
	if extractToken([]byte(`{"code":0}`)) != "" {
		t.Fatal("expected empty token")
	}
}

func TestLoginAllowsEmptyTokenSuccessShape(t *testing.T) {
	body := []byte(`{"accessToken":"","tokenTtl":1793885029,"globalAdmin":true,"username":"nacos"}`)
	if extractToken(body) != "" {
		t.Fatal("expected empty token")
	}
	if !loginAllowsEmptyToken(body) {
		t.Fatal("expected empty-token login to be allowed for success-shaped body")
	}
	if loginAllowsEmptyToken([]byte(`{"code":0}`)) {
		t.Fatal("bare code=0 should not allow empty token")
	}
}
