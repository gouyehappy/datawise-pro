package main

import (
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

var unitNameRe = regexp.MustCompile(`^[a-zA-Z0-9@_.\\:-]+\.service$`)

func validateUnit(unit string) error {
	unit = strings.TrimSpace(unit)
	if unit == "" || !unitNameRe.MatchString(unit) {
		return fmt.Errorf("invalid unit name")
	}
	return nil
}

func validateServiceAction(action string) error {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "start", "stop", "restart":
		return nil
	default:
		return fmt.Errorf("unsupported action %q", action)
	}
}

func listSystemdServicesLocal() ([]ServiceInfo, error) {
	ctxDone := time.After(15 * time.Second)
	_ = ctxDone
	cmd := exec.Command("systemctl", "list-units", "--type=service", "--all", "--no-pager", "--no-legend", "--plain")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("systemctl: %w (%s)", err, truncate(string(out), 200))
	}
	return parseSystemctlList(string(out)), nil
}

func systemctlActionLocal(unit, action string) error {
	if err := validateUnit(unit); err != nil {
		return err
	}
	if err := validateServiceAction(action); err != nil {
		return err
	}
	cmd := exec.Command("systemctl", strings.ToLower(action), unit)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("systemctl %s: %w (%s)", action, err, truncate(string(out), 300))
	}
	return nil
}

func parseSystemctlList(raw string) []ServiceInfo {
	var items []ServiceInfo
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		desc := ""
		if len(fields) > 4 {
			desc = strings.Join(fields[4:], " ")
		}
		items = append(items, ServiceInfo{
			Unit: fields[0], Load: fields[1], Active: fields[2], Sub: fields[3], Description: desc,
		})
	}
	return items
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
