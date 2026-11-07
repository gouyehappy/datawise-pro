package main

import "testing"

func TestListPossiblyTruncated(t *testing.T) {
	cases := []struct {
		loaded, total, page int
		known               bool
		want                bool
	}{
		{100, 500, 200, true, true},
		{200, 200, 200, true, false},
		{200, 0, 200, false, true},
		{50, 0, 200, false, false},
		{0, 0, 200, false, false},
	}
	for _, c := range cases {
		got := listPossiblyTruncated(c.loaded, c.total, c.page, c.known)
		if got != c.want {
			t.Fatalf("%+v => %v, want %v", c, got, c.want)
		}
	}
}
