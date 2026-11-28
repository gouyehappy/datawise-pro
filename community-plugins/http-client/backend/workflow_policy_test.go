package main

import "testing"

func TestNormalizeRunPolicy(t *testing.T) {
	cases := map[string]string{
		"":       "each",
		"each":   "each",
		"EACH":   "each",
		"once":   "once",
		"first":  "once",
		"setup":  "once",
		" other": "each",
	}
	for input, want := range cases {
		if got := normalizeRunPolicy(input); got != want {
			t.Fatalf("normalizeRunPolicy(%q)=%q want %q", input, got, want)
		}
	}
}
