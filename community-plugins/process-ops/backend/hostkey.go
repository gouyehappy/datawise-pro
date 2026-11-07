package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"strings"

	"golang.org/x/crypto/ssh"
)

type hostKeyIssue struct {
	Fingerprint string
	KeyType     string
	KeyB64      string
	Hop         string // bastion | target
}

func (e *hostKeyIssue) Error() string {
	hop := e.Hop
	if hop == "" {
		hop = "target"
	}
	return fmt.Sprintf("HOSTKEY_UNKNOWN hop=%s type=%s fp=%s", hop, e.KeyType, e.Fingerprint)
}

func parseTrustedHostKey(b64 string) (ssh.PublicKey, error) {
	b64 = strings.TrimSpace(b64)
	if b64 == "" {
		return nil, fmt.Errorf("empty trusted host key")
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, fmt.Errorf("decode trusted host key: %w", err)
	}
	key, err := ssh.ParsePublicKey(raw)
	if err != nil {
		return nil, fmt.Errorf("parse trusted host key: %w", err)
	}
	return key, nil
}

func makeHostKeyCallback(spec TargetSpec, capture *ssh.PublicKey) ssh.HostKeyCallback {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		if capture != nil {
			*capture = key
		}
		if trusted := strings.TrimSpace(spec.TrustedHostKey); trusted != "" {
			want, err := parseTrustedHostKey(trusted)
			if err != nil {
				return err
			}
			if ssh.FingerprintSHA256(want) == ssh.FingerprintSHA256(key) {
				return nil
			}
			return fmt.Errorf("HOSTKEY_MISMATCH fp=%s (expected %s)", ssh.FingerprintSHA256(key), ssh.FingerprintSHA256(want))
		}
		if spec.AcceptNewHostKey {
			return nil
		}
		return &hostKeyIssue{
			Fingerprint: ssh.FingerprintSHA256(key),
			KeyType:     key.Type(),
			KeyB64:      base64.StdEncoding.EncodeToString(key.Marshal()),
		}
	}
}

func hostKeyIssueFrom(err error) *hostKeyIssue {
	if err == nil {
		return nil
	}
	var hk *hostKeyIssue
	if errors.As(err, &hk) {
		return hk
	}
	msg := err.Error()
	if strings.Contains(msg, "HOSTKEY_UNKNOWN") || strings.Contains(msg, "HOSTKEY_MISMATCH") {
		return &hostKeyIssue{Fingerprint: msg, KeyType: "unknown"}
	}
	return nil
}
