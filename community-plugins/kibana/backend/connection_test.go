package main

import (
	"net/http"
	"testing"
)

func TestResolveKibanaConnection(t *testing.T) {
	cfg, err := Resolve(map[string]any{
		"connectionId": "c1",
		"connection": map[string]any{
			"id":   "c1",
			"host": "kibana.example.com",
			"port": float64(5601),
			"user": "elastic",
			"external_config": map[string]any{
				"use_https":        true,
				"kibana_base_path": "kibana/s/default",
				"default_index":    "filebeat-*",
				"auth_mode":        "basic",
			},
			"connection_secrets": map[string]any{
				"password": "secret",
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.BaseURL != "https://kibana.example.com:5601" {
		t.Fatalf("base url: %s", cfg.BaseURL)
	}
	if cfg.KibanaBasePath != "/kibana/s/default" {
		t.Fatalf("base path: %s", cfg.KibanaBasePath)
	}
	if cfg.AuthMode != AuthBasic {
		t.Fatalf("auth mode: %s", cfg.AuthMode)
	}
	if cfg.Username != "elastic" || cfg.Password != "secret" {
		t.Fatalf("auth: %s / %s", cfg.Username, cfg.Password)
	}
	if cfg.DefaultIndex != "filebeat-*" {
		t.Fatalf("default index: %s", cfg.DefaultIndex)
	}
}

func TestResolveAuthModes(t *testing.T) {
	t.Run("legacy user+password implies basic", func(t *testing.T) {
		cfg, err := Resolve(map[string]any{
			"connectionId": "legacy",
			"connection": map[string]any{
				"id":   "legacy",
				"host": "127.0.0.1",
				"user": "elastic",
				"connection_secrets": map[string]any{
					"password": "x",
				},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		if cfg.AuthMode != AuthBasic {
			t.Fatalf("got %s", cfg.AuthMode)
		}
	})

	t.Run("anonymous", func(t *testing.T) {
		cfg, err := Resolve(map[string]any{
			"connectionId": "anon",
			"connection": map[string]any{
				"id":   "anon",
				"host": "127.0.0.1",
				"external_config": map[string]any{
					"auth_mode": "none",
				},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		if cfg.AuthMode != AuthNone {
			t.Fatalf("got %s", cfg.AuthMode)
		}
	})

	t.Run("api_key", func(t *testing.T) {
		cfg, err := Resolve(map[string]any{
			"connectionId": "ak",
			"connection": map[string]any{
				"id":   "ak",
				"host": "127.0.0.1",
				"external_config": map[string]any{
					"auth_mode": "api_key",
				},
				"connection_secrets": map[string]any{
					"api_key": "id:secret",
				},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		if cfg.AuthMode != AuthAPIKey || cfg.APIKey != "id:secret" {
			t.Fatalf("%s / %s", cfg.AuthMode, cfg.APIKey)
		}
	})

	t.Run("api_key requires secret", func(t *testing.T) {
		_, err := Resolve(map[string]any{
			"connectionId": "ak-missing",
			"connection": map[string]any{
				"id":   "ak-missing",
				"host": "127.0.0.1",
				"external_config": map[string]any{
					"auth_mode": "api_key",
				},
			},
		})
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("bearer", func(t *testing.T) {
		cfg, err := Resolve(map[string]any{
			"connectionId": "tok",
			"connection": map[string]any{
				"id":   "tok",
				"host": "127.0.0.1",
				"external_config": map[string]any{
					"auth_mode": "bearer",
				},
				"connection_secrets": map[string]any{
					"token": "eyJhbGciOiJIUzI1NiJ9.x.y",
				},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		if cfg.AuthMode != AuthBearer || cfg.BearerToken == "" {
			t.Fatalf("%s / %q", cfg.AuthMode, cfg.BearerToken)
		}
	})
}

func TestApplyAuthHeaders(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "http://example/", nil)
	c := NewClient(&Config{AuthMode: AuthAPIKey, APIKey: "abc:def"})
	c.applyAuth(req)
	got := req.Header.Get("Authorization")
	if got == "" || got[:6] != "ApiKey" {
		t.Fatalf("api key header: %q", got)
	}

	req2, _ := http.NewRequest(http.MethodGet, "http://example/", nil)
	c2 := NewClient(&Config{AuthMode: AuthBearer, BearerToken: "tok123"})
	c2.applyAuth(req2)
	if req2.Header.Get("Authorization") != "Bearer tok123" {
		t.Fatalf("bearer: %q", req2.Header.Get("Authorization"))
	}

	req3, _ := http.NewRequest(http.MethodGet, "http://example/", nil)
	c3 := NewClient(&Config{AuthMode: AuthBasic, Username: "u", Password: "p"})
	c3.applyAuth(req3)
	if req3.Header.Get("Authorization")[:5] != "Basic" {
		t.Fatalf("basic: %q", req3.Header.Get("Authorization"))
	}
}


func TestResolveFullHTTPSURL(t *testing.T) {
	cfg, err := Resolve(map[string]any{
		"connectionId": "c2",
		"connection": map[string]any{
			"id":   "c2",
			"host": "https://png-dev-elkweb-02.example.com/",
			"user": "sdp",
			"external_config": map[string]any{
				"use_https": true,
			},
			"connection_secrets": map[string]any{
				"password": "x",
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.BaseURL != "https://png-dev-elkweb-02.example.com:443" {
		t.Fatalf("base url: %s", cfg.BaseURL)
	}
	if cfg.KibanaBasePath != "" {
		t.Fatalf("expected empty base path, got %q", cfg.KibanaBasePath)
	}
}

func TestBuildDiscoverURL(t *testing.T) {
	url := buildDiscoverURL(&Config{
		BaseURL:        "https://png-dev-elkweb-02.example.com:443",
		KibanaBasePath: "/soc-v7-kibana",
		SpaceID:        "soc_space_sdp",
	})
	want := "https://png-dev-elkweb-02.example.com:443/soc-v7-kibana/s/soc_space_sdp/app/kibana#/discover"
	if url != want {
		t.Fatalf("got %s", url)
	}
}

func TestNormalizePathAndBasePath(t *testing.T) {
	if got := normalizePath("foo"); got != "/foo" {
		t.Fatalf("normalizePath: %s", got)
	}
	if got := normalizeBasePath("/kibana/"); got != "/kibana" {
		t.Fatalf("normalizeBasePath: %s", got)
	}
	if got := normalizeBasePath(""); got != "" {
		t.Fatalf("empty base path: %q", got)
	}
}
