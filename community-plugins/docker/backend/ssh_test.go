package main

import (
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

// startSSHServer 起一个同时提供 ecdsa 与 ed25519 主机密钥的最小 SSH 服务端。
// RFC 4253 规定主机密钥算法取「客户端偏好列表 ∩ 服务端列表」的首项，因此服务端
// 同时提供两种密钥就足以复现真实故障：协商到的类型与 known_hosts 记录的类型错开。
func startSSHServer(t *testing.T) (addr string, ed25519Key ssh.PublicKey) {
	t.Helper()

	_, edPrivate, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate ed25519 host key: %v", err)
	}
	edSigner, err := ssh.NewSignerFromKey(edPrivate)
	if err != nil {
		t.Fatalf("ed25519 signer: %v", err)
	}
	ecPrivate, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate ecdsa host key: %v", err)
	}
	ecSigner, err := ssh.NewSignerFromKey(ecPrivate)
	if err != nil {
		t.Fatalf("ecdsa signer: %v", err)
	}

	serverCfg := &ssh.ServerConfig{NoClientAuth: true}
	serverCfg.AddHostKey(ecSigner)
	serverCfg.AddHostKey(edSigner)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()
				serverConn, channels, requests, err := ssh.NewServerConn(conn, serverCfg)
				if err != nil {
					return
				}
				defer serverConn.Close()
				go ssh.DiscardRequests(requests)
				for channel := range channels {
					_ = channel.Reject(ssh.UnknownChannelType, "not supported in tests")
				}
			}()
		}
	}()
	t.Cleanup(func() {
		_ = listener.Close()
		<-done
	})

	return listener.Addr().String(), edSigner.PublicKey()
}

func writeKnownHosts(t *testing.T, addr string, keys ...ssh.PublicKey) string {
	t.Helper()
	addresses := []string{knownhosts.Normalize(addr)}
	var builder strings.Builder
	for _, key := range keys {
		builder.WriteString(knownhosts.Line(addresses, key))
		builder.WriteString("\n")
	}
	path := filepath.Join(t.TempDir(), "known_hosts")
	if err := os.WriteFile(path, []byte(builder.String()), 0o600); err != nil {
		t.Fatalf("write known_hosts: %v", err)
	}
	return path
}

// TestDialPrefersKeyTypeRecordedInKnownHosts 锁定真实故障（NAS/fnOS 场景）：
// 服务端同时提供 ecdsa 与 ed25519，known_hosts 里只有 ed25519（OpenSSH 生成的常见形态）。
// x/crypto 默认偏好 ECDSA，协商结果便与文件记录的 ed25519 错开，返回 key mismatch。
// dialWithHostKeyFallback 必须能连上。
func TestDialPrefersKeyTypeRecordedInKnownHosts(t *testing.T) {
	addr, ed25519Key := startSSHServer(t)
	knownHostsPath := writeKnownHosts(t, addr, ed25519Key)

	callback, err := knownhosts.New(knownHostsPath)
	if err != nil {
		t.Fatalf("knownhosts.New: %v", err)
	}
	cfg := pluginConfig{SSHUsername: "tester"}

	defaultOrder := &ssh.ClientConfig{
		User:            cfg.SSHUsername,
		HostKeyCallback: callback,
		Timeout:         5 * time.Second,
	}
	client, err := ssh.Dial("tcp", addr, defaultOrder)
	if err == nil {
		client.Close()
		t.Fatal("expected the default host key preference to reject an ed25519-only known_hosts entry")
	}
	if !isHostKeyError(err) {
		t.Fatalf("expected a host key error from the default order, got: %v", err)
	}

	client, err = dialWithHostKeyFallback(addr, cfg, nil, callback)
	if err != nil {
		t.Fatalf("dialWithHostKeyFallback should have matched the recorded ed25519 key, got: %v", err)
	}
	defer client.Close()
}

func TestDialStillFailsOnUnknownHostKey(t *testing.T) {
	addr, _ := startSSHServer(t)
	knownHostsPath := writeKnownHosts(t, addr)

	callback, err := knownhosts.New(knownHostsPath)
	if err != nil {
		t.Fatalf("knownhosts.New: %v", err)
	}
	client, err := dialWithHostKeyFallback(addr, pluginConfig{SSHUsername: "tester"}, nil, callback)
	if err == nil {
		client.Close()
		t.Fatal("expected a host with no known_hosts entry to be rejected")
	}
	if !isHostKeyError(err) {
		t.Fatalf("expected a host key error, got: %v", err)
	}
}

func TestDialStillRejectsChangedHostKey(t *testing.T) {
	addr, _ := startSSHServer(t)
	_, otherPrivate, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	otherSigner, err := ssh.NewSignerFromKey(otherPrivate)
	if err != nil {
		t.Fatal(err)
	}
	knownHostsPath := writeKnownHosts(t, addr, otherSigner.PublicKey())
	callback, err := knownhosts.New(knownHostsPath)
	if err != nil {
		t.Fatal(err)
	}
	client, err := dialWithHostKeyFallback(addr, pluginConfig{SSHUsername: "tester"}, nil, callback)
	if err == nil {
		client.Close()
		t.Fatal("changed server identity must be rejected even after algorithm fallback")
	}
	if !isHostKeyError(err) {
		t.Fatalf("expected host key failure, got %v", err)
	}
	described := describeSSHFailure(err, "127.0.0.1", addr, knownHostsPath)
	if !strings.Contains(described.Error(), "does not match") || !strings.Contains(described.Error(), knownHostsPath) {
		t.Fatalf("mismatch must identify the known_hosts file: %v", described)
	}
}

func TestDescribeSSHFailureIsActionable(t *testing.T) {
	sshHost := "192.168.31.2"
	addr := sshHost + ":22"
	path := "/home/user/.ssh/known_hosts"

	unknown := describeSSHFailure(&knownhosts.KeyError{}, sshHost, addr, path)
	if !strings.Contains(unknown.Error(), "ssh-keyscan 192.168.31.2") {
		t.Fatalf("unknown host key message should point at ssh-keyscan, got: %v", unknown)
	}
	if !strings.Contains(unknown.Error(), path) {
		t.Fatalf("unknown host key message should name the known_hosts file, got: %v", unknown)
	}

	other := &knownhosts.KeyError{}
	plain := describeSSHFailure(other, sshHost, addr, path)
	if !strings.Contains(plain.Error(), path) {
		t.Fatalf("mismatch message should name the known_hosts file, got: %v", plain)
	}

	network := describeSSHFailure(errText("dial tcp: i/o timeout"), sshHost, addr, path)
	if !strings.Contains(network.Error(), "Failed to connect SSH server "+addr) {
		t.Fatalf("network errors should keep the original wording, got: %v", network)
	}
	if strings.Contains(network.Error(), "ssh-keyscan") {
		t.Fatalf("network errors must not suggest ssh-keyscan, got: %v", network)
	}
}

type errText string

func (e errText) Error() string { return string(e) }
