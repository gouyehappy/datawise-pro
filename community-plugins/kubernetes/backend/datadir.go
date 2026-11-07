package main

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// pluginDataFile is <DATAWISE_PLUGIN_DATA_DIR>/<name>. The host passes an
// absolute directory inside the workspace; this process must not invent a
// path under the OS user-config directory or a folder named "config".
func pluginDataFile(name string) (string, error) {
	dir := strings.TrimSpace(os.Getenv("DATAWISE_PLUGIN_DATA_DIR"))
	if dir == "" {
		return "", errors.New("host plugin data directory is not configured")
	}
	target := filepath.Join(dir, name)
	migrateLegacyPluginFile(target, name)
	return target, nil
}

func migrateLegacyPluginFile(target, name string) {
	if _, err := os.Stat(target); err == nil {
		return
	}
	base, err := os.UserConfigDir()
	if err != nil || base == "" {
		return
	}
	legacy := filepath.Join(base, "datawise-plugin-kubernetes", name)
	source, err := os.Open(legacy)
	if err != nil {
		return
	}
	defer source.Close()
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return
	}
	dest, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	_, copyErr := io.Copy(dest, source)
	closeErr := dest.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(target)
	}
}
