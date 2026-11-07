package main

import (
	"encoding/base64"
	"fmt"
	"io"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

const optB64Chunk = 96 // keep pasted lines short — JumpServer often truncates long stdin lines

// dialJumpServerAsset connects to KoKo Opt>, selects an asset, then keeps an
// interactive shell session for subsequent command runs (not ProxyJump).
func dialJumpServerAsset(target TargetSpec, jump JumpSpec) (*sshCollector, ssh.PublicKey, error) {
	if strings.TrimSpace(target.Host) == "" && strings.TrimSpace(target.MenuID) == "" {
		return nil, nil, fmt.Errorf("JumpServer asset host or menuId required")
	}
	jumpSpec := TargetSpec{
		Host:             jump.Host,
		Port:             jump.Port,
		User:             jump.User,
		Password:         jump.Password,
		PrivateKey:       jump.PrivateKey,
		Passphrase:       jump.Passphrase,
		TrustedHostKey:   jump.TrustedHostKey,
		AcceptNewHostKey: jump.AcceptNewHostKey,
		BastionKind:      "jumpserver",
	}
	if jumpSpec.Port <= 0 {
		jumpSpec.Port = 2222
	}
	bastion, bastionKey, err := dialSSHDirect(jumpSpec)
	if err != nil {
		if hk := hostKeyIssueFrom(err); hk != nil {
			hk.Hop = "bastion"
			return nil, bastionKey, hk
		}
		return nil, bastionKey, fmt.Errorf("bastion: %w", err)
	}

	session, err := bastion.client.NewSession()
	if err != nil {
		bastion.Close()
		return nil, bastionKey, fmt.Errorf("jumpserver session: %w", err)
	}
	modes := ssh.TerminalModes{
		ssh.ECHO:          0,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm", 40, 200, modes); err != nil {
		_ = session.Close()
		bastion.Close()
		return nil, bastionKey, fmt.Errorf("jumpserver pty: %w", err)
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		_ = session.Close()
		bastion.Close()
		return nil, bastionKey, err
	}
	stderr, _ := session.StderrPipe()
	stdin, err := session.StdinPipe()
	if err != nil {
		_ = session.Close()
		bastion.Close()
		return nil, bastionKey, err
	}
	if err := session.Shell(); err != nil {
		_ = session.Close()
		bastion.Close()
		return nil, bastionKey, fmt.Errorf("jumpserver shell: %w", err)
	}

	c := &sshCollector{
		client:     bastion.client,
		spec:       target,
		optMode:    true,
		optSession: session,
		optStdin:   stdin,
	}
	c.startOptReaders(stdout, stderr)

	deadline := time.Now().Add(22 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(c.optSnapshot(), "Opt>") {
			break
		}
		time.Sleep(120 * time.Millisecond)
	}
	if !strings.Contains(c.optSnapshot(), "Opt>") {
		c.Close()
		return nil, bastionKey, fmt.Errorf("JumpServer Opt> not detected — confirm KoKo login on port %d", jumpSpec.Port)
	}

	// Prefer numeric Opt> id; fall back to IP / hostname (same as SSH plugin enter).
	selector := strings.TrimSpace(target.MenuID)
	if selector == "" || !isAllDigits(selector) {
		selector = strings.TrimSpace(target.Host)
	}
	if selector == "" {
		selector = strings.TrimSpace(target.DisplayName)
	}
	// Clear half-typed input then select asset.
	_, _ = io.WriteString(stdin, "\x03")
	time.Sleep(120 * time.Millisecond)
	c.optReset()
	if _, err := io.WriteString(stdin, selector+"\r"); err != nil {
		c.Close()
		return nil, bastionKey, err
	}

	enterDeadline := time.Now().Add(25 * time.Second)
	entered := false
	for time.Now().Before(enterDeadline) {
		text := c.optSnapshot()
		lower := strings.ToLower(text)
		if strings.Contains(lower, "offline") || strings.Contains(text, "无权限") ||
			strings.Contains(lower, "permission deny") || strings.Contains(lower, "not found") {
			snippet := truncate(strings.TrimSpace(text[max(0, len(text)-240):]), 200)
			c.Close()
			return nil, bastionKey, fmt.Errorf("JumpServer asset select failed (%s): %s", selector, snippet)
		}
		// Left Opt> menu and landed on a real shell / system prompt.
		if !strings.HasSuffix(strings.TrimSpace(text), "Opt>") && assetShellReady(text) {
			entered = true
			break
		}
		time.Sleep(120 * time.Millisecond)
	}
	if !entered {
		snippet := truncate(strings.TrimSpace(c.optSnapshot()[max(0, len(c.optSnapshot())-300):]), 220)
		c.Close()
		return nil, bastionKey, fmt.Errorf("JumpServer did not enter asset %s: %s", selector, snippet)
	}

	// Prove the interactive shell can run commands (also clears MotD noise).
	if probe, err := c.runOptShell("echo DW_JS_OK; uname -s 2>/dev/null || echo ok"); err != nil || !strings.Contains(probe, "DW_JS_OK") {
		c.Close()
		return nil, bastionKey, fmt.Errorf("JumpServer asset shell not usable: %v (%s)", err, truncate(probe, 160))
	}
	return c, bastionKey, nil
}

func assetShellReady(text string) bool {
	// Need some post-select output and no trailing Opt> prompt.
	trimmed := strings.TrimSpace(text)
	if trimmed == "" || strings.HasSuffix(trimmed, "Opt>") {
		return false
	}
	// Look at the last non-empty line.
	lines := strings.Split(trimmed, "\n")
	last := ""
	for i := len(lines) - 1; i >= 0; i-- {
		l := strings.TrimSpace(lines[i])
		if l != "" {
			last = l
			break
		}
	}
	if last == "" || last == "Opt>" {
		return false
	}
	if strings.HasSuffix(last, "Opt>") {
		return false
	}
	// Common shell / login markers after JumpServer asset enter.
	if strings.HasSuffix(last, "$") || strings.HasSuffix(last, "#") || strings.HasSuffix(last, "%") {
		return true
	}
	if strings.Contains(last, "@") && (strings.HasSuffix(last, "$") || strings.HasSuffix(last, "#") || strings.Contains(last, ":~")) {
		return true
	}
	// Login banners often finish with a prompt-like line; also accept if Opt> disappeared
	// and we received a sizable chunk after select (hostname / Last login / etc.).
	idx := strings.LastIndex(text, "Opt>")
	if idx >= 0 {
		after := strings.TrimSpace(text[idx+4:])
		if len(after) > 40 && !strings.Contains(after, "Opt>") {
			lower := strings.ToLower(after)
			if strings.Contains(lower, "last login") ||
				strings.Contains(lower, "welcome") ||
				strings.Contains(after, "$") ||
				strings.Contains(after, "#") ||
				strings.Contains(lower, "linux") {
				return true
			}
		}
	}
	return false
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (c *sshCollector) startOptReaders(stdout, stderr io.Reader) {
	pump := func(r io.Reader) {
		if r == nil {
			return
		}
		tmp := make([]byte, 8192)
		for {
			n, err := r.Read(tmp)
			if n > 0 {
				chunk := stripANSI(string(tmp[:n]))
				c.optOutMu.Lock()
				c.optOut.WriteString(chunk)
				c.optOutMu.Unlock()
			}
			if err != nil {
				return
			}
		}
	}
	go pump(stdout)
	go pump(stderr)
}

func (c *sshCollector) optSnapshot() string {
	c.optOutMu.Lock()
	defer c.optOutMu.Unlock()
	return c.optOut.String()
}

func (c *sshCollector) optReset() {
	c.optOutMu.Lock()
	c.optOut.Reset()
	c.optOutMu.Unlock()
}

// alive reports whether the JumpServer / SSH session still looks usable.
func (c *sshCollector) alive() bool {
	if c == nil {
		return false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.client == nil {
		return false
	}
	if c.optMode {
		return c.optStdin != nil && c.optSession != nil
	}
	return true
}

// keepalive sends a tiny probe through Opt> (or a no-op for direct SSH).
func (c *sshCollector) keepalive() error {
	if c == nil {
		return fmt.Errorf("ssh not connected")
	}
	if !c.optMode {
		return nil
	}
	out, err := c.runOptShell("echo DW_JS_KA")
	if err != nil {
		return err
	}
	if !strings.Contains(out, "DW_JS_KA") {
		return fmt.Errorf("jumpserver keepalive failed (%s)", truncate(out, 120))
	}
	return nil
}

func (c *sshCollector) runOptShell(cmd string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.optStdin == nil {
		return "", fmt.Errorf("jumpserver asset shell not connected")
	}

	// Let trailing MotD / prompts settle, then clear so markers stay unique.
	time.Sleep(150 * time.Millisecond)
	c.optReset()

	startMark := fmt.Sprintf("DWST%d", time.Now().UnixNano())
	endMark := fmt.Sprintf("DWEN%d", time.Now().UnixNano())
	b64 := base64.StdEncoding.EncodeToString([]byte(cmd))

	var sendErr error
	writeLine := func(line string) {
		if sendErr != nil {
			return
		}
		_, sendErr = io.WriteString(c.optStdin, line+"\n")
		time.Sleep(12 * time.Millisecond)
	}

	if len(b64) <= optB64Chunk*2 {
		// Short payload: one line is fine.
		writeLine(fmt.Sprintf(
			"echo %s; echo %s | (base64 -d 2>/dev/null || base64 --decode 2>/dev/null || openssl base64 -d 2>/dev/null) | bash; echo %s",
			startMark, b64, endMark,
		))
	} else {
		// Long scripts (overview): chunk into a temp b64 file — avoids JumpServer line truncation.
		tag := fmt.Sprintf("%d", time.Now().UnixNano())
		b64Path := "/tmp/.dw_js_" + tag + ".b64"
		shPath := "/tmp/.dw_js_" + tag + ".sh"
		writeLine("rm -f " + b64Path + " " + shPath)
		for i := 0; i < len(b64); i += optB64Chunk {
			end := i + optB64Chunk
			if end > len(b64) {
				end = len(b64)
			}
			writeLine("printf '%s' '" + b64[i:end] + "' >> " + b64Path)
		}
		writeLine(fmt.Sprintf(
			"echo %s; (base64 -d <%s 2>/dev/null || base64 --decode <%s 2>/dev/null || openssl base64 -d -in %s 2>/dev/null) >%s && bash %s; rm -f %s %s; echo %s",
			startMark, b64Path, b64Path, b64Path, shPath, shPath, b64Path, shPath, endMark,
		))
	}
	if sendErr != nil {
		return "", sendErr
	}

	deadline := time.Now().Add(sshCmdTimeout + 40*time.Second)
	for time.Now().Before(deadline) {
		if out, ok := extractMarkedOutput(c.optSnapshot(), startMark, endMark); ok {
			c.optReset()
			return out, nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	tail := truncate(strings.TrimSpace(c.optSnapshot()), 240)
	c.optReset()
	return "", fmt.Errorf("jumpserver command timed out (%s)", tail)
}

// extractMarkedOutput finds start/end markers as whole lines so an echoed
// command line that embeds both marker strings cannot falsely match.
func extractMarkedOutput(text, startMark, endMark string) (string, bool) {
	lines := strings.Split(text, "\n")
	startIdx := -1
	endIdx := -1
	for i, line := range lines {
		t := strings.TrimSpace(line)
		if startIdx < 0 {
			if t == startMark {
				startIdx = i
			}
			continue
		}
		if t == endMark {
			endIdx = i
			break
		}
	}
	if startIdx < 0 || endIdx <= startIdx {
		return "", false
	}
	body := strings.Join(lines[startIdx+1:endIdx], "\n")
	return strings.TrimRight(body, "\n\r"), true
}
