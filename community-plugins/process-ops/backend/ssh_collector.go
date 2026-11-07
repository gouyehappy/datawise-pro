package main

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

const (
	sshDialTimeout = 12 * time.Second
	sshCmdTimeout  = 20 * time.Second
	sshMaxOutput   = 512 * 1024
)

type sshCollector struct {
	mu         sync.Mutex
	client     *ssh.Client
	bastion    *ssh.Client // kept alive for ProxyJump; nil for direct / JumpServer shell
	spec       TargetSpec
	optMode    bool // JumpServer asset interactive shell
	optSession *ssh.Session
	optStdin   io.WriteCloser
	optOutMu   sync.Mutex
	optOut     strings.Builder // filled by dedicated reader goroutines (never use racing Read)
}

func dialSSH(spec TargetSpec) (*sshCollector, error) {
	client, _, err := dialSSHWithKey(spec)
	return client, err
}

func dialSSHWithKey(spec TargetSpec) (*sshCollector, ssh.PublicKey, error) {
	if strings.TrimSpace(spec.Via) != "" {
		if spec.Jump == nil || strings.TrimSpace(spec.Jump.Host) == "" {
			return nil, nil, fmt.Errorf("jump bastion required for via=%s", spec.Via)
		}
		jump := *spec.Jump
		// JumpServer/KoKo: must enter Opt> asset — ProxyJump TCP dial will always fail.
		if isJumpServerBastion(TargetSpec{BastionKind: jump.BastionKind}) ||
			isJumpServerBastion(spec) ||
			jump.Port == 2222 {
			return dialJumpServerAsset(spec, jump)
		}
		return dialSSHViaJump(spec, jump)
	}
	return dialSSHDirect(spec)
}

func dialSSHDirect(spec TargetSpec) (*sshCollector, ssh.PublicKey, error) {
	if strings.TrimSpace(spec.Host) == "" {
		return nil, nil, fmt.Errorf("host is required")
	}
	port := spec.Port
	if port <= 0 {
		port = 22
	}
	user := spec.User
	if user == "" {
		user = "root"
	}
	auth, err := sshAuthMethods(spec)
	if err != nil {
		return nil, nil, err
	}
	var seen ssh.PublicKey
	cfg := &ssh.ClientConfig{
		User:            user,
		Auth:            auth,
		HostKeyCallback: makeHostKeyCallback(spec, &seen),
		Timeout:         sshDialTimeout,
	}
	addr := net.JoinHostPort(spec.Host, strconv.Itoa(port))
	client, err := ssh.Dial("tcp", addr, cfg)
	if err != nil {
		if hk := hostKeyIssueFrom(err); hk != nil {
			if hk.Hop == "" {
				hk.Hop = "target"
			}
			return nil, seen, hk
		}
		msg := err.Error()
		if strings.Contains(msg, "HOSTKEY_UNKNOWN") || strings.Contains(msg, "HOSTKEY_MISMATCH") {
			return nil, seen, err
		}
		if seen != nil && strings.TrimSpace(spec.TrustedHostKey) == "" && !spec.AcceptNewHostKey {
			return nil, seen, &hostKeyIssue{
				Fingerprint: ssh.FingerprintSHA256(seen),
				KeyType:     seen.Type(),
				KeyB64:      base64.StdEncoding.EncodeToString(seen.Marshal()),
				Hop:         "target",
			}
		}
		return nil, seen, fmt.Errorf("ssh dial: %w", err)
	}
	return &sshCollector{client: client, spec: spec}, seen, nil
}

func dialSSHViaJump(target TargetSpec, jump JumpSpec) (*sshCollector, ssh.PublicKey, error) {
	if strings.TrimSpace(target.Host) == "" {
		return nil, nil, fmt.Errorf("host is required")
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
	}
	bastion, bastionKey, err := dialSSHDirect(jumpSpec)
	if err != nil {
		if hk := hostKeyIssueFrom(err); hk != nil {
			hk.Hop = "bastion"
			return nil, bastionKey, hk
		}
		return nil, bastionKey, fmt.Errorf("bastion: %w", err)
	}

	port := target.Port
	if port <= 0 {
		port = 22
	}
	addr := net.JoinHostPort(target.Host, strconv.Itoa(port))
	netConn, err := bastion.client.Dial("tcp", addr)
	if err != nil {
		bastion.Close()
		return nil, nil, fmt.Errorf("jump dial %s: %w", addr, err)
	}

	user := target.User
	if user == "" {
		user = "root"
	}
	auth, err := sshAuthMethods(target)
	if err != nil {
		_ = netConn.Close()
		bastion.Close()
		return nil, nil, err
	}
	var seen ssh.PublicKey
	cfg := &ssh.ClientConfig{
		User:            user,
		Auth:            auth,
		HostKeyCallback: makeHostKeyCallback(target, &seen),
		Timeout:         sshDialTimeout,
	}
	cc, chans, reqs, err := ssh.NewClientConn(netConn, addr, cfg)
	if err != nil {
		_ = netConn.Close()
		bastion.Close()
		if hk := hostKeyIssueFrom(err); hk != nil {
			hk.Hop = "target"
			return nil, seen, hk
		}
		if seen != nil && strings.TrimSpace(target.TrustedHostKey) == "" && !target.AcceptNewHostKey {
			return nil, seen, &hostKeyIssue{
				Fingerprint: ssh.FingerprintSHA256(seen),
				KeyType:     seen.Type(),
				KeyB64:      base64.StdEncoding.EncodeToString(seen.Marshal()),
				Hop:         "target",
			}
		}
		return nil, seen, fmt.Errorf("jump ssh: %w", err)
	}
	client := ssh.NewClient(cc, chans, reqs)
	return &sshCollector{client: client, bastion: bastion.client, spec: target}, seen, nil
}

func sshAuthMethods(spec TargetSpec) ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod
	if key := strings.TrimSpace(spec.PrivateKey); key != "" {
		var signer ssh.Signer
		var err error
		if pass := spec.Passphrase; pass != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(key), []byte(pass))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(key))
		}
		if err != nil {
			return nil, fmt.Errorf("parse private key: %w", err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	if pw := spec.Password; pw != "" {
		methods = append(methods, ssh.Password(pw))
	}
	if len(methods) == 0 {
		return nil, fmt.Errorf("password or privateKey required")
	}
	return methods, nil
}

func (c *sshCollector) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.optStdin != nil {
		_ = c.optStdin.Close()
		c.optStdin = nil
	}
	if c.optSession != nil {
		_ = c.optSession.Close()
		c.optSession = nil
	}
	if c.client != nil {
		_ = c.client.Close()
		c.client = nil
	}
	if c.bastion != nil {
		_ = c.bastion.Close()
		c.bastion = nil
	}
	c.optMode = false
	c.optReset()
}

func (c *sshCollector) run(cmd string) (string, error) {
	if c.optMode {
		return c.runOptShell(cmd)
	}
	c.mu.Lock()
	client := c.client
	c.mu.Unlock()
	if client == nil {
		return "", fmt.Errorf("ssh not connected")
	}
	session, err := client.NewSession()
	if err != nil {
		return "", err
	}
	defer session.Close()

	var stdout, stderr bytes.Buffer
	session.Stdout = &limitedWriter{buf: &stdout, limit: sshMaxOutput}
	session.Stderr = &limitedWriter{buf: &stderr, limit: 32 * 1024}

	done := make(chan error, 1)
	go func() { done <- session.Run(cmd) }()
	select {
	case err := <-done:
		out := stdout.String()
		if err != nil {
			msg := strings.TrimSpace(stderr.String())
			if msg == "" {
				msg = err.Error()
			}
			return out, fmt.Errorf("%s", truncate(msg, 400))
		}
		return out, nil
	case <-time.After(sshCmdTimeout):
		_ = session.Close()
		return "", fmt.Errorf("command timed out")
	}
}

type limitedWriter struct {
	buf   *bytes.Buffer
	limit int
}

func (w *limitedWriter) Write(p []byte) (int, error) {
	remain := w.limit - w.buf.Len()
	if remain <= 0 {
		return len(p), nil
	}
	if len(p) > remain {
		_, _ = w.buf.Write(p[:remain])
		return len(p), nil
	}
	return w.buf.Write(p)
}

func (c *sshCollector) Overview(targetID string) (*Overview, error) {
	// Keep the remote script compact: JumpServer interactive shells are slow and
	// intolerant of huge pastes (we still chunk via base64 when needed).
	script := `hostname=$(hostname 2>/dev/null||echo unknown)
uptime_sec=$(awk '{print int($1)}' /proc/uptime 2>/dev/null||echo 0)
nproc=$(nproc 2>/dev/null||echo 1)
load=$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null||echo "0 0 0")
mem_total=$(awk '/MemTotal/{print $2*1024}' /proc/meminfo)
mem_avail=$(awk '/MemAvailable/{print $2*1024}' /proc/meminfo)
mem_free=$(awk '/MemFree/{print $2*1024}' /proc/meminfo)
os=$(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-linux}")
read -r _ u1 n1 s1 i1 _ </proc/stat; sleep 0.15; read -r _ u2 n2 s2 i2 _ </proc/stat
d_total=$((u1+n1+s1+i1)); d_total=$((u2+n2+s2+i2-d_total)); d_idle=$((i2-i1)); cpu_pct=0
[ "$d_total" -gt 0 ] && cpu_pct=$(awk -v t=$d_total -v i=$d_idle 'BEGIN{printf "%.2f",(1-i/t)*100}')
echo "HOST|$hostname"; echo "UP|$uptime_sec"; echo "NPROC|$nproc"; echo "LOAD|$load"
echo "MEM|$mem_total|$mem_avail|$mem_free"; echo "OS|$os"; echo "CPU|$cpu_pct"
df -PB1 2>/dev/null|awk 'NR>1&&$1!~/^(tmpfs|devtmpfs|overlay)/{printf "DISK|%s|%s|%s|%s|%s\n",$6,$1,$2,$3,$4}'
awk -F'[: ]+' 'NR>2&&$1!="lo"{rx=$2;tx=$10;if(rx+tx>0)printf "NET|%s|%s|%s\n",$1,rx,tx}' /proc/net/dev 2>/dev/null
`
	var raw string
	var err error
	if c.optMode {
		// Avoid nested bash -lc + multiline quotes on interactive JumpServer shells.
		raw, err = c.run(script)
	} else {
		raw, err = c.run("bash -lc " + shellQuote(script))
	}
	if err != nil && raw == "" {
		return nil, err
	}
	ov := &Overview{
		TargetID: targetID, Kind: TargetSSH, LinuxCapable: true, CollectedAt: time.Now().UTC(),
	}
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "|")
		switch parts[0] {
		case "HOST":
			if len(parts) > 1 {
				ov.Hostname = parts[1]
			}
		case "UP":
			if len(parts) > 1 {
				ov.UptimeSec, _ = strconv.ParseInt(parts[1], 10, 64)
			}
		case "NPROC":
			if len(parts) > 1 {
				ov.CPUCount, _ = strconv.Atoi(parts[1])
			}
		case "LOAD":
			if len(parts) > 1 {
				loads := strings.Fields(parts[1])
				if len(loads) >= 3 {
					ov.Load1, _ = strconv.ParseFloat(loads[0], 64)
					ov.Load5, _ = strconv.ParseFloat(loads[1], 64)
					ov.Load15, _ = strconv.ParseFloat(loads[2], 64)
				}
			}
		case "MEM":
			if len(parts) >= 3 {
				ov.MemTotal, _ = strconv.ParseUint(parts[1], 10, 64)
				ov.MemAvailable, _ = strconv.ParseUint(parts[2], 10, 64)
				if ov.MemTotal >= ov.MemAvailable {
					ov.MemUsed = ov.MemTotal - ov.MemAvailable
				}
				if ov.MemTotal > 0 {
					ov.MemPercent = float64(ov.MemUsed) / float64(ov.MemTotal) * 100
				}
			}
		case "OS":
			if len(parts) > 1 {
				ov.OS = parts[1]
			}
		case "CPU":
			if len(parts) > 1 {
				ov.CPUPercent, _ = strconv.ParseFloat(parts[1], 64)
			}
		case "DISK":
			if len(parts) >= 6 {
				total, _ := strconv.ParseUint(parts[3], 10, 64)
				used, _ := strconv.ParseUint(parts[4], 10, 64)
				free, _ := strconv.ParseUint(parts[5], 10, 64)
				pct := 0.0
				if total > 0 {
					pct = float64(used) / float64(total) * 100
				}
				ov.Disks = append(ov.Disks, DiskInfo{
					Mount: parts[1], Device: parts[2], Total: total, Used: used, Free: free, UsedPercent: pct,
				})
			}
		case "NET":
			if len(parts) >= 4 {
				rx, _ := strconv.ParseUint(parts[2], 10, 64)
				tx, _ := strconv.ParseUint(parts[3], 10, 64)
				ov.Network = append(ov.Network, NetInfo{Name: parts[1], Rx: rx, Tx: tx})
			}
		}
	}
	return ov, nil
}

func (c *sshCollector) ListProcesses(query string, limit int) ([]ProcessInfo, error) {
	if limit <= 0 || limit > 2000 {
		limit = 500
	}
	// pid ppid user %cpu %mem rss cmd
	raw, err := c.run(`ps -eo pid=,ppid=,user:32=,%cpu=,%mem=,rss=,args= --sort=-%cpu 2>/dev/null | head -n 800`)
	if err != nil {
		return nil, err
	}
	q := strings.ToLower(strings.TrimSpace(query))
	var out []ProcessInfo
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 7 {
			continue
		}
		pid64, _ := strconv.ParseInt(fields[0], 10, 32)
		ppid64, _ := strconv.ParseInt(fields[1], 10, 32)
		cpuV, _ := strconv.ParseFloat(fields[3], 64)
		memV, _ := strconv.ParseFloat(fields[4], 64)
		rssKB, _ := strconv.ParseUint(fields[5], 10, 64)
		info := ProcessInfo{
			PID: int32(pid64), PPID: int32(ppid64), User: fields[2],
			CPU: cpuV, Mem: memV, MemRSS: rssKB * 1024,
			Name: fields[6], Cmd: strings.Join(fields[6:], " "),
		}
		if q != "" {
			hay := strings.ToLower(fmt.Sprintf("%d %s %s %s", info.PID, info.Name, info.User, info.Cmd))
			if !strings.Contains(hay, q) {
				continue
			}
		}
		out = append(out, info)
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

func (c *sshCollector) Kill(pid int32, signal string) error {
	if pid <= 1 {
		return fmt.Errorf("refusing to signal protected pid %d", pid)
	}
	sig := strings.ToUpper(strings.TrimSpace(signal))
	switch sig {
	case "", "TERM", "SIGTERM":
		sig = "TERM"
	case "KILL", "SIGKILL":
		sig = "KILL"
	case "INT", "SIGINT":
		sig = "INT"
	default:
		return fmt.Errorf("unsupported signal %q", signal)
	}
	_, err := c.run(fmt.Sprintf("kill -s %s %d", sig, pid))
	return err
}

func (c *sshCollector) ListServices() ([]ServiceInfo, error) {
	raw, err := c.run(`systemctl list-units --type=service --all --no-pager --no-legend --plain 2>/dev/null`)
	if err != nil {
		return nil, err
	}
	return parseSystemctlList(raw), nil
}

func (c *sshCollector) ServiceAction(unit, action string) error {
	if err := validateUnit(unit); err != nil {
		return err
	}
	if err := validateServiceAction(action); err != nil {
		return err
	}
	_, err := c.run(fmt.Sprintf("systemctl %s %s", strings.ToLower(action), unit))
	return err
}

func (c *sshCollector) OOMSnippet() string {
	raw, err := c.run(`(journalctl -k -n 80 --no-pager 2>/dev/null || dmesg 2>/dev/null | tail -n 80) | grep -iE 'oom|killed process|out of memory' | tail -n 40`)
	if err != nil {
		return ""
	}
	out := strings.TrimSpace(raw)
	// JumpServer Opt> / non-Linux shells often echo transport noise instead of dmesg.
	lower := strings.ToLower(out)
	if out == "" ||
		strings.Contains(lower, "no pty") ||
		strings.Contains(lower, "opt>") ||
		strings.Contains(lower, "permission denied") ||
		strings.Contains(lower, "not found") {
		return ""
	}
	return out
}

func shellQuote(s string) string {
	return `'` + strings.ReplaceAll(s, `'`, `'\''`) + `'`
}
