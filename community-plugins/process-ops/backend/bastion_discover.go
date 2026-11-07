package main

import (
	"bufio"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var (
	reIPv4      = regexp.MustCompile(`^\d{1,3}(\.\d{1,3}){3}$`)
	reHostToken = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,253}$`)
)

func (c *sshCollector) DiscoverHosts(mode string) ([]DiscoverItem, error) {
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode == "" {
		mode = "default"
	}
	// JumpServer / KoKo: assets live in Opt>/HTTP API, not /etc/hosts.
	if isJumpServerBastion(c.spec) || mode == "jumpserver" {
		return c.DiscoverJumpServer()
	}
	seen := map[string]DiscoverItem{}

	add := func(host, name, user, source string, port int) {
		host = strings.TrimSpace(host)
		if !validDiscoverHost(host) {
			return
		}
		key := strings.ToLower(host)
		if port > 0 {
			key = fmt.Sprintf("%s:%d", key, port)
		}
		if _, ok := seen[key]; ok {
			return
		}
		if name == "" {
			name = host
		}
		if port <= 0 {
			port = 22
		}
		seen[key] = DiscoverItem{Host: host, Port: port, Name: name, User: user, Source: source}
	}

	// /etc/hosts + getent
	if out, err := c.run(`bash -lc 'getent hosts 2>/dev/null || cat /etc/hosts 2>/dev/null'`); err == nil {
		for _, it := range parseHostsFile(out) {
			add(it.Host, it.Name, "", "hosts", it.Port)
		}
	}

	// Common inventory files
	invCmd := `bash -lc 'for f in /etc/ansible/hosts "$HOME/inventory" /opt/hosts.list /etc/hosts.list; do [ -f "$f" ] && echo "FILE|$f" && cat "$f" && echo; done 2>/dev/null'`
	if out, err := c.run(invCmd); err == nil {
		cur := "inventory"
		for _, line := range strings.Split(out, "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "FILE|") {
				cur = strings.TrimPrefix(line, "FILE|")
				continue
			}
			host, port, name := parseInventoryLine(line)
			if host != "" {
				add(host, name, "", cur, port)
			}
		}
	}

	if mode == "ssh_config" || mode == "all" || mode == "default" {
		if out, err := c.run(`bash -lc 'cat "$HOME/.ssh/config" /etc/ssh/ssh_config 2>/dev/null'`); err == nil {
			for _, it := range parseSSHConfig(out) {
				add(it.Host, it.Name, it.User, "ssh_config", it.Port)
			}
		}
	}

	items := make([]DiscoverItem, 0, len(seen))
	for _, v := range seen {
		items = append(items, v)
	}
	// Auto-fallback: empty classic discover on a KoKo Opt> bastion (common mis-tag).
	if len(items) == 0 && (mode == "default" || mode == "all") {
		if jsItems, err := c.DiscoverJumpServer(); err == nil && len(jsItems) > 0 {
			return jsItems, nil
		}
	}
	return items, nil
}

func validDiscoverHost(host string) bool {
	host = strings.TrimSpace(host)
	if host == "" || len(host) > 253 {
		return false
	}
	lower := strings.ToLower(host)
	if lower == "localhost" || lower == "localhost.localdomain" || host == "127.0.0.1" || host == "::1" {
		return false
	}
	if strings.HasPrefix(host, "*") || strings.ContainsAny(host, " \t") {
		return false
	}
	return reHostToken.MatchString(host) || reIPv4.MatchString(host)
}

func parseHostsFile(raw string) []DiscoverItem {
	var out []DiscoverItem
	sc := bufio.NewScanner(strings.NewReader(raw))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		ip := fields[0]
		if !reIPv4.MatchString(ip) && !strings.Contains(ip, ":") {
			// getent may be "ip name" or reverse; still accept first token as addr
			continue
		}
		for _, name := range fields[1:] {
			name = strings.TrimSuffix(name, ".")
			if !validDiscoverHost(name) && !validDiscoverHost(ip) {
				continue
			}
			host := name
			if !validDiscoverHost(name) {
				host = ip
			}
			if validDiscoverHost(host) {
				out = append(out, DiscoverItem{Host: host, Name: name, Port: 22, Source: "hosts"})
			}
		}
	}
	return out
}

func parseInventoryLine(line string) (host string, port int, name string) {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "[") {
		return "", 0, ""
	}
	// ansible-ish: hostname ansible_host=1.2.3.4 ansible_port=22
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return "", 0, ""
	}
	name = fields[0]
	host = name
	port = 22
	for _, f := range fields[1:] {
		kv := strings.SplitN(f, "=", 2)
		if len(kv) != 2 {
			continue
		}
		k := strings.ToLower(kv[0])
		v := strings.Trim(kv[1], `"'`)
		switch k {
		case "ansible_host", "ansible_ssh_host":
			host = v
		case "ansible_port", "ansible_ssh_port":
			if p, err := strconv.Atoi(v); err == nil {
				port = p
			}
		}
	}
	// bare host:port
	if strings.Count(host, ":") == 1 && !strings.Contains(host, "::") {
		h, p, ok := strings.Cut(host, ":")
		if ok {
			if n, err := strconv.Atoi(p); err == nil {
				host = h
				port = n
			}
		}
	}
	if !validDiscoverHost(host) {
		return "", 0, ""
	}
	return host, port, name
}

func parseSSHConfig(raw string) []DiscoverItem {
	var out []DiscoverItem
	var curHosts []string
	var hostname, user string
	var port int

	flush := func() {
		hn := hostname
		for _, alias := range curHosts {
			if strings.ContainsAny(alias, "*?!") {
				continue
			}
			host := hn
			if host == "" {
				host = alias
			}
			if !validDiscoverHost(host) {
				continue
			}
			name := alias
			if name == "" {
				name = host
			}
			p := port
			if p <= 0 {
				p = 22
			}
			out = append(out, DiscoverItem{Host: host, Port: p, Name: name, User: user, Source: "ssh_config"})
		}
		curHosts = nil
		hostname, user = "", ""
		port = 0
	}

	sc := bufio.NewScanner(strings.NewReader(raw))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		key := strings.ToLower(fields[0])
		val := strings.Join(fields[1:], " ")
		switch key {
		case "host":
			flush()
			curHosts = fields[1:]
		case "hostname":
			hostname = val
		case "port":
			if p, err := strconv.Atoi(val); err == nil {
				port = p
			}
		case "user":
			user = val
		}
	}
	flush()
	return out
}
