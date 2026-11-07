package main

import "testing"

func TestParsePolarisPasswordAuth(t *testing.T) {
	cfg, err := parseConnConfig(map[string]any{
		"connection": map[string]any{
			"host": "polaris.local",
			"port": float64(8090),
			"user": "admin",
			"external_config": map[string]any{
				"protocol":    "http",
				"auth_method": "password",
				"owner":       "polaris",
			},
			"connection_secrets": map[string]any{
				"password": "pwd",
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.BaseURL != "http://polaris.local:8090" {
		t.Fatalf("baseURL=%q", cfg.BaseURL)
	}
	if cfg.AuthMethod != "password" || cfg.Username != "admin" || cfg.Password != "pwd" {
		t.Fatalf("auth=%+v", cfg)
	}
}

func TestParsePolarisTokenAuth(t *testing.T) {
	cfg, err := parseConnConfig(map[string]any{
		"connection": map[string]any{
			"host": "polaris.local",
			"external_config": map[string]any{
				"protocol":    "https",
				"auth_method": "token",
				"port":        float64(443),
			},
			"connection_secrets": map[string]any{
				"token": "abc",
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Token != "abc" || cfg.Protocol != "https" || cfg.Port != 443 {
		t.Fatalf("%+v", cfg)
	}
}

func TestPasswordAsTokenFallback(t *testing.T) {
	cfg, err := parseConnConfig(map[string]any{
		"connection": map[string]any{
			"host": "polaris.local",
			"external_config": map[string]any{
				"protocol": "http",
			},
			"connection_secrets": map[string]any{
				"password": "tok",
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AuthMethod != "token" || cfg.Token != "tok" {
		t.Fatalf("%+v", cfg)
	}
}

func TestParsePolarisURLMode(t *testing.T) {
	cfg, err := parseConnConfig(map[string]any{
		"connection": map[string]any{
			"user": "admin",
			"external_config": map[string]any{
				"connect_mode": "url",
				"base_url":     "https://polaris.example.com:8443/console",
				"auth_method":  "password",
			},
			"connection_secrets": map[string]any{
				"password": "pwd",
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Protocol != "https" || cfg.Host != "polaris.example.com" || cfg.Port != 8443 {
		t.Fatalf("endpoint=%+v", cfg)
	}
	if cfg.ContextPath != "/console" {
		t.Fatalf("context=%q", cfg.ContextPath)
	}
	if cfg.BaseURL != "https://polaris.example.com:8443/console" {
		t.Fatalf("baseURL=%q", cfg.BaseURL)
	}
	if cfg.Username != "admin" || cfg.Password != "pwd" {
		t.Fatalf("auth=%+v", cfg)
	}
}

func TestParsePolarisURLDefaultPort(t *testing.T) {
	cfg, err := parseConnConfig(map[string]any{
		"connection": map[string]any{
			"external_config": map[string]any{
				"connect_mode": "url",
				"base_url":     "http://192.0.2.11",
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != 80 || cfg.BaseURL != "http://192.0.2.11:80" {
		t.Fatalf("%+v", cfg)
	}
}

func TestParsePolarisURLTrailingColon(t *testing.T) {
	cfg, err := parseConnConfig(map[string]any{
		"connection": map[string]any{
			"external_config": map[string]any{
				"connect_mode": "url",
				"base_url":     "http://polaris-dev.example.com:",
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Host != "polaris-dev.example.com" || cfg.Port != 80 {
		t.Fatalf("%+v", cfg)
	}
}

func TestParsePolarisHostPastedURL(t *testing.T) {
	cfg, err := parseConnConfig(map[string]any{
		"connection": map[string]any{
			"host": "http://10.0.0.8:8090",
			"external_config": map[string]any{
				"connect_mode": "host",
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Host != "10.0.0.8" || cfg.Port != 8090 || cfg.BaseURL != "http://10.0.0.8:8090" {
		t.Fatalf("%+v", cfg)
	}
}
