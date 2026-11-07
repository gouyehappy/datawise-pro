package main

import (
	"fmt"
	"runtime"
	"sort"
	"strings"
	"time"
)

type collector interface {
	Overview(targetID string) (*Overview, error)
	ListProcesses(query string, limit int) ([]ProcessInfo, error)
	Kill(pid int32, signal string) error
	ListServices() ([]ServiceInfo, error)
	ServiceAction(unit, action string) error
	Exec(command string) (*ExecResult, error)
	TailLogs(source string, lines int) (*LogsResult, error)
}

func runDiagnose(c collector, targetID string, oomFn func() string) (*DiagnoseReport, error) {
	ov, err := c.Overview(targetID)
	if err != nil {
		return nil, err
	}
	procs, err := c.ListProcesses("", 200)
	if err != nil {
		return nil, err
	}
	byCPU := append([]ProcessInfo(nil), procs...)
	sort.Slice(byCPU, func(i, j int) bool { return byCPU[i].CPU > byCPU[j].CPU })
	byMem := append([]ProcessInfo(nil), procs...)
	sort.Slice(byMem, func(i, j int) bool { return byMem[i].Mem > byMem[j].Mem })

	topN := 5
	if len(byCPU) > topN {
		byCPU = byCPU[:topN]
	}
	if len(byMem) > topN {
		byMem = byMem[:topN]
	}

	var findings []DiagnoseFinding
	if ov.CPUPercent >= 90 {
		findings = append(findings, DiagnoseFinding{
			Severity: "critical", Code: "cpu.high",
			Title: "CPU usage critical", Detail: fmt.Sprintf("CPU at %.1f%%", ov.CPUPercent),
		})
	} else if ov.CPUPercent >= 75 {
		findings = append(findings, DiagnoseFinding{
			Severity: "warn", Code: "cpu.elevated",
			Title: "CPU usage elevated", Detail: fmt.Sprintf("CPU at %.1f%%", ov.CPUPercent),
		})
	}
	if ov.MemPercent >= 92 {
		findings = append(findings, DiagnoseFinding{
			Severity: "critical", Code: "mem.high",
			Title: "Memory pressure critical", Detail: fmt.Sprintf("Memory at %.1f%%", ov.MemPercent),
		})
	} else if ov.MemPercent >= 80 {
		findings = append(findings, DiagnoseFinding{
			Severity: "warn", Code: "mem.elevated",
			Title: "Memory pressure elevated", Detail: fmt.Sprintf("Memory at %.1f%%", ov.MemPercent),
		})
	}
	if ov.CPUCount > 0 && ov.Load1 > float64(ov.CPUCount)*1.5 {
		findings = append(findings, DiagnoseFinding{
			Severity: "warn", Code: "load.high",
			Title: "Load average high vs cores",
			Detail: fmt.Sprintf("load1=%.2f cores=%d", ov.Load1, ov.CPUCount),
		})
	}
	for _, d := range ov.Disks {
		if d.UsedPercent >= 95 {
			findings = append(findings, DiagnoseFinding{
				Severity: "critical", Code: "disk.full",
				Title: "Disk nearly full", Detail: fmt.Sprintf("%s at %.1f%%", d.Mount, d.UsedPercent),
			})
		} else if d.UsedPercent >= 85 {
			findings = append(findings, DiagnoseFinding{
				Severity: "warn", Code: "disk.pressure",
				Title: "Disk pressure", Detail: fmt.Sprintf("%s at %.1f%%", d.Mount, d.UsedPercent),
			})
		}
	}
	if len(byCPU) > 0 && byCPU[0].CPU >= 50 {
		findings = append(findings, DiagnoseFinding{
			Severity: "info", Code: "proc.top_cpu",
			Title: "Top CPU process",
			Detail: fmt.Sprintf("%s (pid %d) @ %.1f%%", byCPU[0].Name, byCPU[0].PID, byCPU[0].CPU),
		})
	}
	if len(byMem) > 0 && byMem[0].Mem >= 10 {
		findings = append(findings, DiagnoseFinding{
			Severity: "info", Code: "proc.top_mem",
			Title: "Top memory process",
			Detail: fmt.Sprintf("%s (pid %d) @ %.1f%%", byMem[0].Name, byMem[0].PID, byMem[0].Mem),
		})
	}

	if ov.LinuxCapable {
		if svcs, svcErr := c.ListServices(); svcErr == nil {
			var failed []string
			for _, s := range svcs {
				if strings.EqualFold(s.Active, "failed") {
					failed = append(failed, s.Unit)
				}
			}
			if n := len(failed); n > 0 {
				show := failed
				extra := ""
				if n > 8 {
					show = failed[:8]
					extra = fmt.Sprintf(" (+%d more)", n-8)
				}
				sev := "warn"
				if n >= 3 {
					sev = "critical"
				}
				findings = append(findings, DiagnoseFinding{
					Severity: sev, Code: "systemd.failed",
					Title:  fmt.Sprintf("%d failed systemd unit(s)", n),
					Detail: strings.Join(show, ", ") + extra,
				})
			}
		}
	}

	oom := ""
	if oomFn != nil && ov.LinuxCapable {
		oom = oomFn()
		if oom != "" {
			findings = append(findings, DiagnoseFinding{
				Severity: "warn", Code: "oom.evidence",
				Title: "OOM-related kernel messages found",
				Detail: truncate(oom, 240),
			})
		}
	} else if !ov.LinuxCapable {
		findings = append(findings, DiagnoseFinding{
			Severity: "info", Code: "oom.unsupported",
			Title: "OOM journal scan skipped",
			Detail: fmt.Sprintf("Not available on %s", runtime.GOOS),
		})
	}

	summary := "No major issues detected"
	crit, warn := 0, 0
	for _, f := range findings {
		if f.Severity == "critical" {
			crit++
		} else if f.Severity == "warn" {
			warn++
		}
	}
	switch {
	case crit > 0:
		summary = fmt.Sprintf("%d critical, %d warning finding(s)", crit, warn)
	case warn > 0:
		summary = fmt.Sprintf("%d warning finding(s)", warn)
	case len(findings) > 0:
		summary = fmt.Sprintf("%d informational finding(s)", len(findings))
	}

	return &DiagnoseReport{
		TargetID: targetID, CollectedAt: time.Now().UTC(), Summary: summary,
		Findings: findings, TopCPU: byCPU, TopMem: byMem, OOMSnippet: oom, Overview: ov,
	}, nil
}

func formatDiagnoseText(r *DiagnoseReport) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Process Ops diagnose — %s\n%s\n\n", r.TargetID, r.Summary)
	for _, f := range r.Findings {
		fmt.Fprintf(&b, "[%s] %s: %s\n", f.Severity, f.Title, f.Detail)
	}
	if r.OOMSnippet != "" {
		fmt.Fprintf(&b, "\n--- OOM snippet ---\n%s\n", r.OOMSnippet)
	}
	return b.String()
}
