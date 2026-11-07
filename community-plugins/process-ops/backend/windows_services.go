package main

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"time"
)

var winServiceNameRe = regexp.MustCompile(`^[A-Za-z0-9_./\\-]{1,128}$`)

func validateWinService(name string) error {
	name = strings.TrimSpace(name)
	if name == "" || !winServiceNameRe.MatchString(name) {
		return fmt.Errorf("invalid Windows service name")
	}
	return nil
}

func listWindowsServicesLocal() ([]ServiceInfo, error) {
	if runtime.GOOS != "windows" {
		return nil, fmt.Errorf("Windows services only available on Windows")
	}
	cmd := exec.Command(
		"powershell",
		"-NoProfile",
		"-NonInteractive",
		"-Command",
		`Get-Service | Select-Object -Property Name,Status,StartType,DisplayName | ConvertTo-Json -Compress`,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("Get-Service: %w (%s)", err, truncate(string(out), 200))
	}
	raw := strings.TrimSpace(string(out))
	if raw == "" || raw == "null" {
		return []ServiceInfo{}, nil
	}
	type row struct {
		Name        string          `json:"Name"`
		Status      json.RawMessage `json:"Status"`
		StartType   json.RawMessage `json:"StartType"`
		DisplayName string          `json:"DisplayName"`
	}
	var rows []row
	if err := json.Unmarshal([]byte(raw), &rows); err != nil {
		var one row
		if err2 := json.Unmarshal([]byte(raw), &one); err2 != nil {
			return nil, fmt.Errorf("parse Get-Service json: %w", err)
		}
		rows = []row{one}
	}
	items := make([]ServiceInfo, 0, len(rows))
	for _, r := range rows {
		st := winFlexLabel(r.Status)
		items = append(items, ServiceInfo{
			Unit:        r.Name,
			Load:        winFlexLabel(r.StartType),
			Active:      st,
			Sub:         st,
			Description: r.DisplayName,
		})
	}
	return items, nil
}

func winFlexLabel(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil && s != "" {
		return strings.ToLower(s)
	}
	var n int
	if err := json.Unmarshal(raw, &n); err == nil {
		// ServiceControllerStatus / ServiceStartMode numeric enums
		switch n {
		case 1:
			return "stopped"
		case 2:
			return "start-pending"
		case 3:
			return "stop-pending"
		case 4:
			return "running"
		case 5:
			return "continue-pending"
		case 6:
			return "pause-pending"
		case 7:
			return "paused"
		case 0:
			return "boot"
		}
		// StartType Automatic=2 Manual=3 Disabled=4 already overlapped — keep numeric fallback
		return fmt.Sprintf("%d", n)
	}
	return strings.Trim(string(raw), `"`)
}

func windowsServiceActionLocal(name, action string) error {
	if err := validateWinService(name); err != nil {
		return err
	}
	if err := validateServiceAction(action); err != nil {
		return err
	}
	act := strings.ToLower(strings.TrimSpace(action))
	var script string
	switch act {
	case "start":
		script = fmt.Sprintf(`Start-Service -Name '%s' -ErrorAction Stop`, escapePS(name))
	case "stop":
		script = fmt.Sprintf(`Stop-Service -Name '%s' -Force -ErrorAction Stop`, escapePS(name))
	case "restart":
		script = fmt.Sprintf(`Restart-Service -Name '%s' -Force -ErrorAction Stop`, escapePS(name))
	default:
		return fmt.Errorf("unsupported action %q", action)
	}
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	done := make(chan error, 1)
	go func() {
		out, err := cmd.CombinedOutput()
		if err != nil {
			done <- fmt.Errorf("%s: %w (%s)", act, err, truncate(string(out), 300))
			return
		}
		done <- nil
	}()
	select {
	case err := <-done:
		return err
	case <-time.After(45 * time.Second):
		_ = cmd.Process.Kill()
		return fmt.Errorf("%s timed out", act)
	}
}

func escapePS(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}
