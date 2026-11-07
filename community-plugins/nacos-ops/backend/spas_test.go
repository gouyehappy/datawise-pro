package main

import "testing"

func TestSpasSignPayload(t *testing.T) {
	if got := spasSignPayload("123", "", ""); got != "123" {
		t.Fatalf("empty resource: %q", got)
	}
	if got := spasSignPayload("123", "DEFAULT_GROUP", ""); got != "DEFAULT_GROUP+123" {
		t.Fatalf("group only: %q", got)
	}
	if got := spasSignPayload("123", "DEFAULT_GROUP", "dev"); got != "DEFAULT_GROUP+dev+123" {
		t.Fatalf("group+tenant: %q", got)
	}
}

func TestSpasSignatureStable(t *testing.T) {
	a := spasSignature("secret", "1700000000000", "g", "t")
	b := spasSignature("secret", "1700000000000", "g", "t")
	if a == "" || a != b {
		t.Fatalf("signature unstable: %q %q", a, b)
	}
}
