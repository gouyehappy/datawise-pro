package main

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/ssh"
)

const (
	execTimeout   = 25 * time.Second
	execMaxOutput = 200 * 1024
)

type ExecResult struct {
	Command    string `json:"command"`
	ExitCode   int    `json:"exitCode"`
	Stdout     string `json:"stdout"`
	Stderr     string `json:"stderr"`
	Truncated  bool   `json:"truncated"`
	DurationMs int64  `json:"durationMs"`
}

type LogsResult struct {
	Source    string `json:"source"`
	Content   string `json:"content"`
	Truncated bool   `json:"truncated"`
}

func sanitizeExecCommand(cmd string) (string, error) {
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return "", fmt.Errorf("command is empty")
	}
	if len(cmd) > 4000 {
		return "", fmt.Errorf("command too long")
	}
	// Block obvious dangerous patterns for non-interactive ops console.
	lower := strings.ToLower(cmd)
	blocked := []string{
		"mkfs", "diskpart", "format c:", ":(){", "fork bomb",
		"rm -rf /", "rm -rf /*", "> /dev/sd",
	}
	for _, b := range blocked {
		if strings.Contains(lower, b) {
			return "", fmt.Errorf("command blocked by safety policy")
		}
	}
	return cmd, nil
}

func clipOutput(s string, limit int) (string, bool) {
	if len(s) <= limit {
		return s, false
	}
	// Avoid cutting mid-rune
	cut := limit
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut] + "\n…(truncated)", true
}

func (localCollector) Exec(command string) (*ExecResult, error) {
	cmd, err := sanitizeExecCommand(command)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), execTimeout)
	defer cancel()
	var c *exec.Cmd
	if runtime.GOOS == "windows" {
		c = exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", cmd)
	} else {
		c = exec.CommandContext(ctx, "bash", "-lc", cmd)
	}
	var stdout, stderr bytes.Buffer
	c.Stdout = &limitedWriter{buf: &stdout, limit: execMaxOutput}
	c.Stderr = &limitedWriter{buf: &stderr, limit: execMaxOutput / 4}
	start := time.Now()
	runErr := c.Run()
	outStr, truncOut := clipOutput(stdout.String(), execMaxOutput)
	errStr, truncErr := clipOutput(stderr.String(), execMaxOutput/4)
	res := &ExecResult{
		Command:    cmd,
		Stdout:     outStr,
		Stderr:     errStr,
		Truncated:  truncOut || truncErr || stdout.Len() >= execMaxOutput,
		DurationMs: time.Since(start).Milliseconds(),
		ExitCode:   0,
	}
	if runErr != nil {
		if ctx.Err() == context.DeadlineExceeded {
			res.ExitCode = -1
			res.Stderr = strings.TrimSpace(res.Stderr + "\ncommand timed out")
			return res, nil
		}
		if ee, ok := runErr.(*exec.ExitError); ok {
			res.ExitCode = ee.ExitCode()
			return res, nil
		}
		return nil, runErr
	}
	return res, nil
}

func (localCollector) TailLogs(source string, lines int) (*LogsResult, error) {
	if lines <= 0 || lines > 500 {
		lines = 100
	}
	src := strings.ToLower(strings.TrimSpace(source))
	if src == "" {
		src = "syslog"
	}
	switch runtime.GOOS {
	case "windows":
		logName := "Application"
		switch src {
		case "syslog", "journal", "application", "app":
			logName = "Application"
		case "kern", "kernel", "system":
			logName = "System"
		case "auth", "security":
			logName = "Security"
		default:
			return nil, fmt.Errorf("unknown log source %q", source)
		}
		ps := fmt.Sprintf(
			"Get-WinEvent -LogName %s -MaxEvents %d -ErrorAction SilentlyContinue | ForEach-Object { \"$($_.TimeCreated.ToString('s')) [$($_.LevelDisplayName)] $($_.Message -replace '[\\r\\n]+',' ')\" }",
			logName, lines,
		)
		res, err := (localCollector{}).Exec(ps)
		if err != nil {
			return nil, err
		}
		content := res.Stdout
		if content == "" {
			content = res.Stderr
		}
		return &LogsResult{Source: logName, Content: content, Truncated: res.Truncated}, nil
	case "linux":
		var cmd string
		switch src {
		case "journal", "syslog":
			cmd = fmt.Sprintf(`journalctl -n %d --no-pager 2>/dev/null || tail -n %d /var/log/syslog 2>/dev/null || tail -n %d /var/log/messages 2>/dev/null`, lines, lines, lines)
		case "kern", "kernel":
			cmd = fmt.Sprintf(`journalctl -k -n %d --no-pager 2>/dev/null || dmesg | tail -n %d`, lines, lines)
		case "auth":
			cmd = fmt.Sprintf(`journalctl -u ssh -n %d --no-pager 2>/dev/null || tail -n %d /var/log/auth.log 2>/dev/null`, lines, lines)
		default:
			return nil, fmt.Errorf("unknown log source %q", source)
		}
		res, err := (localCollector{}).Exec(cmd)
		if err != nil {
			return nil, err
		}
		content := res.Stdout
		if content == "" {
			content = res.Stderr
		}
		return &LogsResult{Source: src, Content: content, Truncated: res.Truncated}, nil
	default:
		return nil, fmt.Errorf("logs not supported on %s", runtime.GOOS)
	}
}

func (c *sshCollector) Exec(command string) (*ExecResult, error) {
	cmd, err := sanitizeExecCommand(command)
	if err != nil {
		return nil, err
	}
	// JumpServer asset shell: reuse interactive Opt> session.
	if c.optMode {
		start := time.Now()
		out, runErr := c.run("bash -lc " + shellQuote(cmd))
		outStr, trunc := clipOutput(out, execMaxOutput)
		res := &ExecResult{
			Command:    cmd,
			Stdout:     outStr,
			Stderr:     "",
			Truncated:  trunc,
			DurationMs: time.Since(start).Milliseconds(),
			ExitCode:   0,
		}
		if runErr != nil {
			res.ExitCode = 1
			res.Stderr = runErr.Error()
		}
		return res, nil
	}
	c.mu.Lock()
	client := c.client
	c.mu.Unlock()
	if client == nil {
		return nil, fmt.Errorf("ssh not connected")
	}
	session, err := client.NewSession()
	if err != nil {
		return nil, err
	}
	defer session.Close()

	var stdout, stderr bytes.Buffer
	session.Stdout = &limitedWriter{buf: &stdout, limit: execMaxOutput}
	session.Stderr = &limitedWriter{buf: &stderr, limit: execMaxOutput / 4}

	start := time.Now()
	done := make(chan error, 1)
	go func() { done <- session.Run("bash -lc " + shellQuote(cmd)) }()

	var runErr error
	select {
	case runErr = <-done:
	case <-time.After(execTimeout):
		_ = session.Close()
		runErr = fmt.Errorf("command timed out")
	}

	outStr, truncOut := clipOutput(stdout.String(), execMaxOutput)
	errStr, truncErr := clipOutput(stderr.String(), execMaxOutput/4)
	res := &ExecResult{
		Command:    cmd,
		Stdout:     outStr,
		Stderr:     errStr,
		Truncated:  truncOut || truncErr,
		DurationMs: time.Since(start).Milliseconds(),
		ExitCode:   0,
	}
	if runErr != nil {
		if ee, ok := runErr.(*ssh.ExitError); ok {
			res.ExitCode = ee.ExitStatus()
		} else if strings.Contains(runErr.Error(), "timed out") {
			res.ExitCode = -1
			res.Stderr = strings.TrimSpace(res.Stderr + "\ncommand timed out")
		} else {
			res.ExitCode = 1
			if res.Stderr == "" {
				res.Stderr = runErr.Error()
			}
		}
	}
	return res, nil
}

func (c *sshCollector) TailLogs(source string, lines int) (*LogsResult, error) {
	if lines <= 0 || lines > 500 {
		lines = 100
	}
	src := strings.ToLower(strings.TrimSpace(source))
	if src == "" {
		src = "syslog"
	}
	var cmd string
	switch src {
	case "journal", "syslog":
		cmd = fmt.Sprintf(`journalctl -n %d --no-pager 2>/dev/null || tail -n %d /var/log/syslog 2>/dev/null || tail -n %d /var/log/messages 2>/dev/null`, lines, lines, lines)
	case "kern", "kernel":
		cmd = fmt.Sprintf(`journalctl -k -n %d --no-pager 2>/dev/null || dmesg | tail -n %d`, lines, lines)
	case "auth":
		cmd = fmt.Sprintf(`journalctl -u ssh -n %d --no-pager 2>/dev/null || tail -n %d /var/log/auth.log 2>/dev/null || tail -n %d /var/log/secure 2>/dev/null`, lines, lines, lines)
	default:
		return nil, fmt.Errorf("unknown log source %q", source)
	}
	out, err := c.run(cmd)
	content, trunc := clipOutput(out, execMaxOutput)
	if err != nil && content == "" {
		return nil, err
	}
	return &LogsResult{Source: src, Content: content, Truncated: trunc}, nil
}
