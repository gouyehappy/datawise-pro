package main

import "testing"

func TestNormalizeNamespaceID(t *testing.T) {
	cases := map[string]string{
		"":                 "",
		"public":           "",
		"PUBLIC":           "",
		"  public  ":       "",
		"public_namespace": "",
		"dev":              "dev",
	}
	for in, want := range cases {
		if got := normalizeNamespaceID(in); got != want {
			t.Fatalf("%q => %q, want %q", in, got, want)
		}
	}
}

func TestResolveAPIModeV2Default(t *testing.T) {
	cfg := ConnConfig{Host: "127.0.0.1", Port: 8848, Protocol: "http", Implementation: "nacos", VersionMode: "auto"}
	cfg.resolveAPIMode()
	if cfg.V3API {
		t.Fatalf("expected v2 on 8848 auto")
	}
	if cfg.ContextPath != "/nacos" {
		t.Fatalf("context=%q", cfg.ContextPath)
	}
}

func TestResolveAPIModeV3Port8080(t *testing.T) {
	cfg := ConnConfig{Host: "127.0.0.1", Port: 8080, Protocol: "http", Implementation: "nacos", VersionMode: "auto"}
	cfg.resolveAPIMode()
	if !cfg.V3API {
		t.Fatalf("expected v3 on 8080 auto")
	}
}

func TestParseConnConfigBindings(t *testing.T) {
	cfg, err := parseConnConfig(map[string]any{
		"connection": map[string]any{
			"host": "nacos.local",
			"port": float64(8848),
			"user": "nacos",
			"external_config": map[string]any{
				"protocol":       "https",
				"implementation": "nacos",
				"version_mode":   "v3",
				"read_only":      true,
			},
			"connection_secrets": map[string]any{
				"password": "secret",
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Host != "nacos.local" || cfg.Username != "nacos" || cfg.Password != "secret" {
		t.Fatalf("identity parse failed: %+v", cfg)
	}
	if !cfg.V3API || !cfg.ReadOnly || cfg.Protocol != "https" {
		t.Fatalf("flags parse failed: %+v", cfg)
	}
	if cfg.BaseURL != "https://nacos.local:8848" {
		t.Fatalf("baseURL=%q", cfg.BaseURL)
	}
}

func TestParseConnConfigURLMode(t *testing.T) {
	cfg, err := parseConnConfig(map[string]any{
		"connection": map[string]any{
			"user": "nacos",
			"external_config": map[string]any{
				"connect_mode":   "url",
				"base_url":       "http://nacos.example.com:8848/nacos",
				"implementation": "nacos",
				"version_mode":   "auto",
			},
			"connection_secrets": map[string]any{
				"password": "pwd",
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Host != "nacos.example.com" || cfg.Port != 8848 || cfg.ContextPath != "/nacos" {
		t.Fatalf("endpoint=%+v", cfg)
	}
	if cfg.BaseURL != "http://nacos.example.com:8848/nacos" {
		t.Fatalf("baseURL=%q", cfg.BaseURL)
	}
	if cfg.V3API {
		t.Fatalf("expected v2 for 8848+/nacos auto, got v3")
	}
}

func TestParseConnConfigURLTrailingColon(t *testing.T) {
	cfg, err := parseConnConfig(map[string]any{
		"connection": map[string]any{
			"external_config": map[string]any{
				"connect_mode":   "url",
				"base_url":       "http://nacos.dev.local:",
				"implementation": "nacos",
				"version_mode":   "auto",
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Host != "nacos.dev.local" || cfg.Port != 80 {
		t.Fatalf("%+v", cfg)
	}
}
