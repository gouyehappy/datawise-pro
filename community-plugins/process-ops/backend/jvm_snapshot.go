package main

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// JvmSnapshot is a one-shot Spring Boot / Java incident capture:
// heap/GC glance + condensed thread dump + host OOM evidence.
type JvmSnapshot struct {
	TargetID       string    `json:"targetId"`
	PID            int32     `json:"pid"`
	MainClass      string    `json:"mainClass,omitempty"`
	Cmd            string    `json:"cmd,omitempty"`
	CPU            float64   `json:"cpu,omitempty"`
	Mem            float64   `json:"mem,omitempty"`
	Tools          []string  `json:"tools,omitempty"`
	HeapInfo       string    `json:"heapInfo,omitempty"`
	GCUtil         string    `json:"gcUtil,omitempty"`
	ThreadSummary  string    `json:"threadSummary,omitempty"`
	ThreadDump     string    `json:"threadDump,omitempty"`
	OOMSnippet     string    `json:"oomSnippet,omitempty"`
	Notes          []string  `json:"notes,omitempty"`
	CollectedAt    time.Time `json:"collectedAt"`
	JavaCandidates []ProcessInfo `json:"javaCandidates,omitempty"`
}

var reMainClass = regexp.MustCompile(`(?i)(?:^|\s)(-jar\s+(\S+)|([\w.$]+(?:Application|Boot|Server|Main)))(?:\s|$)`)

func isJavaProcess(p ProcessInfo) bool {
	n := strings.ToLower(p.Name)
	c := strings.ToLower(p.Cmd)
	if n == "java" || strings.HasPrefix(n, "java") {
		return true
	}
	if strings.Contains(c, "/java ") || strings.Contains(c, "\\java ") || strings.HasSuffix(c, "/java") {
		return true
	}
	if strings.Contains(c, "org.springframework") || strings.Contains(c, "spring-boot") {
		return true
	}
	if strings.Contains(c, "-jar ") && (strings.Contains(c, ".jar") || strings.Contains(c, "java")) {
		return true
	}
	return false
}

func guessMainClass(cmd string) string {
	m := reMainClass.FindStringSubmatch(cmd)
	if len(m) >= 3 && m[2] != "" {
		return m[2]
	}
	if len(m) >= 4 && m[3] != "" {
		return m[3]
	}
	// Fallback: last non-flag token that looks like a class or jar.
	fields := strings.Fields(cmd)
	for i := len(fields) - 1; i >= 0; i-- {
		f := fields[i]
		if strings.HasPrefix(f, "-") {
			continue
		}
		if strings.HasSuffix(f, ".jar") || strings.Contains(f, ".") {
			return truncate(f, 120)
		}
	}
	return ""
}

func summarizeThreadDump(dump string) string {
	if dump == "" {
		return ""
	}
	lines := strings.Split(dump, "\n")
	var states = map[string]int{}
	var blocked []string
	var runnableHot []string
	for i, line := range lines {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "\"") && strings.Contains(t, "nid=") {
			state := ""
			lower := strings.ToLower(t)
			switch {
			case strings.Contains(lower, "runnable"):
				state = "RUNNABLE"
			case strings.Contains(lower, "waiting on condition"):
				state = "WAITING"
			case strings.Contains(lower, "timed_waiting"):
				state = "TIMED_WAITING"
			case strings.Contains(lower, "blocked"):
				state = "BLOCKED"
			case strings.Contains(lower, "waiting"):
				state = "WAITING"
			default:
				state = "OTHER"
			}
			states[state]++
			name := t
			if len(name) > 100 {
				name = name[:100] + "…"
			}
			if state == "BLOCKED" && len(blocked) < 8 {
				blocked = append(blocked, name)
			}
			if state == "RUNNABLE" && len(runnableHot) < 8 {
				// Prefer threads that look app-related in following frames.
				looksHot := false
				for j := i + 1; j < len(lines) && j < i+6; j++ {
					f := lines[j]
					if strings.Contains(f, "at ") &&
						(strings.Contains(f, "org.springframework") ||
							strings.Contains(f, "com.") ||
							strings.Contains(f, "Controller") ||
							strings.Contains(f, "Service") ||
							strings.Contains(f, "jdbc") ||
							strings.Contains(f, "http")) {
						looksHot = true
						break
					}
				}
				if looksHot {
					runnableHot = append(runnableHot, name)
				}
			}
		}
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Thread states:")
	order := []string{"RUNNABLE", "BLOCKED", "WAITING", "TIMED_WAITING", "OTHER"}
	for _, k := range order {
		if n := states[k]; n > 0 {
			fmt.Fprintf(&b, " %s=%d", k, n)
		}
	}
	b.WriteString("\n")
	if len(blocked) > 0 {
		b.WriteString("BLOCKED sample:\n")
		for _, s := range blocked {
			b.WriteString("  - ")
			b.WriteString(s)
			b.WriteByte('\n')
		}
	}
	if len(runnableHot) > 0 {
		b.WriteString("RUNNABLE app-ish sample:\n")
		for _, s := range runnableHot {
			b.WriteString("  - ")
			b.WriteString(s)
			b.WriteByte('\n')
		}
	}
	return strings.TrimSpace(b.String())
}

func clipJvm(s string, limit int) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	out, _ := clipOutput(s, limit)
	return out
}

func execOut(c collector, cmd string) (string, error) {
	res, err := c.Exec(cmd)
	if err != nil {
		return "", err
	}
	out := strings.TrimSpace(res.Stdout)
	if out == "" {
		out = strings.TrimSpace(res.Stderr)
	}
	if res.ExitCode != 0 && out == "" {
		return "", fmt.Errorf("exit %d", res.ExitCode)
	}
	return out, nil
}

func runJvmSnapshot(c collector, targetID string, pid int32, oomFn func() string) (*JvmSnapshot, error) {
	snap := &JvmSnapshot{
		TargetID:    targetID,
		CollectedAt: time.Now().UTC(),
		Notes:       []string{},
		Tools:       []string{},
	}

	procs, err := c.ListProcesses("", 400)
	if err != nil {
		return nil, err
	}
	var javas []ProcessInfo
	for _, p := range procs {
		if isJavaProcess(p) {
			javas = append(javas, p)
		}
	}
	sort.Slice(javas, func(i, j int) bool {
		if javas[i].CPU == javas[j].CPU {
			return javas[i].Mem > javas[j].Mem
		}
		return javas[i].CPU > javas[j].CPU
	})
	if len(javas) > 12 {
		snap.JavaCandidates = javas[:12]
	} else {
		snap.JavaCandidates = javas
	}

	var chosen *ProcessInfo
	if pid > 0 {
		for i := range procs {
			if procs[i].PID == pid {
				chosen = &procs[i]
				break
			}
		}
		if chosen == nil {
			snap.Notes = append(snap.Notes, fmt.Sprintf("pid %d not in process list; still attempting jcmd/jstack", pid))
			chosen = &ProcessInfo{PID: pid, Name: "java"}
		} else if !isJavaProcess(*chosen) {
			snap.Notes = append(snap.Notes, "selected process may not be a JVM; tools may fail")
		}
	} else if len(javas) > 0 {
		chosen = &javas[0]
		snap.Notes = append(snap.Notes, "no pid given — picked highest-CPU Java process")
	} else {
		snap.Notes = append(snap.Notes, "no Java process found on this host")
		if oomFn != nil {
			snap.OOMSnippet = clipJvm(oomFn(), 4000)
		}
		return snap, nil
	}

	snap.PID = chosen.PID
	snap.Cmd = truncate(chosen.Cmd, 400)
	snap.MainClass = guessMainClass(chosen.Cmd)
	snap.CPU = chosen.CPU
	snap.Mem = chosen.Mem
	pidStr := strconv.FormatInt(int64(chosen.PID), 10)

	// Prefer jcmd (JDK), then jstack. Use timeout wrappers lightly via shell.
	heap, herr := execOut(c, "jcmd "+pidStr+" GC.heap_info 2>/dev/null || jcmd "+pidStr+" VM.native_memory summary 2>/dev/null | head -n 80")
	if herr == nil && heap != "" && !strings.Contains(strings.ToLower(heap), "not found") {
		snap.HeapInfo = clipJvm(heap, 6000)
		snap.Tools = append(snap.Tools, "jcmd GC.heap_info")
	} else {
		snap.Notes = append(snap.Notes, "jcmd heap info unavailable (install JDK tools on the host or run as same user as the JVM)")
	}

	gc, gerr := execOut(c, "jstat -gcutil "+pidStr+" 2>/dev/null | tail -n 2")
	if gerr == nil && gc != "" && !strings.Contains(strings.ToLower(gc), "not found") {
		snap.GCUtil = clipJvm(gc, 1500)
		snap.Tools = append(snap.Tools, "jstat -gcutil")
	} else {
		// Alternate: jcmd GC.class_histogram is heavy — skip. Try VM.info snippet.
		info, ierr := execOut(c, "jcmd "+pidStr+" VM.info 2>/dev/null | grep -iE 'garbage|heap|gc |metaspace' | head -n 40")
		if ierr == nil && info != "" {
			snap.GCUtil = clipJvm(info, 3000)
			snap.Tools = append(snap.Tools, "jcmd VM.info (gc lines)")
		} else {
			snap.Notes = append(snap.Notes, "GC util unavailable (jstat/jcmd)")
		}
	}

	dump, derr := execOut(c, "jcmd "+pidStr+" Thread.print 2>/dev/null")
	if derr != nil || dump == "" || strings.Contains(strings.ToLower(dump), "command not found") {
		dump, derr = execOut(c, "jstack -l "+pidStr+" 2>/dev/null")
		if derr == nil && dump != "" {
			snap.Tools = append(snap.Tools, "jstack")
		}
	} else {
		snap.Tools = append(snap.Tools, "jcmd Thread.print")
	}
	if dump != "" {
		snap.ThreadSummary = summarizeThreadDump(dump)
		snap.ThreadDump = clipJvm(dump, 48000)
	} else {
		snap.Notes = append(snap.Notes, "thread dump failed — need jcmd/jstack and permission to attach to the JVM (same user / ptrace)")
	}

	if oomFn != nil {
		snap.OOMSnippet = clipJvm(oomFn(), 4000)
		if snap.OOMSnippet == "" {
			snap.Notes = append(snap.Notes, "no recent host OOM kernel lines matched")
		}
	}

	return snap, nil
}

func formatJvmSnapshotText(s *JvmSnapshot) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Process Ops JVM snapshot — %s pid=%d\n", s.TargetID, s.PID)
	if s.MainClass != "" {
		fmt.Fprintf(&b, "main/jar: %s\n", s.MainClass)
	}
	if s.Cmd != "" {
		fmt.Fprintf(&b, "cmd: %s\n", s.Cmd)
	}
	fmt.Fprintf(&b, "cpu=%.1f%% mem=%.1f%% tools=%s\n\n", s.CPU, s.Mem, strings.Join(s.Tools, ", "))
	if s.ThreadSummary != "" {
		fmt.Fprintf(&b, "--- Thread summary ---\n%s\n\n", s.ThreadSummary)
	}
	if s.HeapInfo != "" {
		fmt.Fprintf(&b, "--- Heap ---\n%s\n\n", s.HeapInfo)
	}
	if s.GCUtil != "" {
		fmt.Fprintf(&b, "--- GC ---\n%s\n\n", s.GCUtil)
	}
	if s.OOMSnippet != "" {
		fmt.Fprintf(&b, "--- Host OOM ---\n%s\n\n", s.OOMSnippet)
	}
	for _, n := range s.Notes {
		fmt.Fprintf(&b, "note: %s\n", n)
	}
	if s.ThreadDump != "" {
		fmt.Fprintf(&b, "\n--- Thread dump (truncated) ---\n%s\n", s.ThreadDump)
	}
	return b.String()
}
