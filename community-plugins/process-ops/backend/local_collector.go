package main

import (
	"fmt"
	"runtime"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

type localCollector struct{}

func (localCollector) Overview(targetID string) (*Overview, error) {
	ov := &Overview{
		TargetID:     targetID,
		Kind:         TargetLocal,
		OS:           runtime.GOOS,
		CollectedAt:  time.Now().UTC(),
		LinuxCapable: runtime.GOOS == "linux",
	}
	if hi, err := host.Info(); err == nil {
		ov.Hostname = hi.Hostname
		ov.UptimeSec = int64(hi.Uptime)
		if hi.Platform != "" {
			ov.OS = hi.Platform + " " + hi.PlatformVersion
		}
	}
	if pcts, err := cpu.Percent(200*time.Millisecond, false); err == nil && len(pcts) > 0 {
		ov.CPUPercent = pcts[0]
	}
	if n, err := cpu.Counts(true); err == nil {
		ov.CPUCount = n
	}
	if avg, err := load.Avg(); err == nil && avg != nil {
		ov.Load1, ov.Load5, ov.Load15 = avg.Load1, avg.Load5, avg.Load15
	}
	if vm, err := mem.VirtualMemory(); err == nil {
		ov.MemTotal = vm.Total
		ov.MemUsed = vm.Used
		ov.MemAvailable = vm.Available
		ov.MemPercent = vm.UsedPercent
	}
	if parts, err := disk.Partitions(false); err == nil {
		seen := map[string]struct{}{}
		for _, p := range parts {
			if _, ok := seen[p.Mountpoint]; ok {
				continue
			}
			seen[p.Mountpoint] = struct{}{}
			u, err := disk.Usage(p.Mountpoint)
			if err != nil || u.Total == 0 {
				continue
			}
			// Skip tiny / pseudo mounts noise on Unix
			if strings.HasPrefix(p.Fstype, "tmpfs") || p.Fstype == "overlay" || p.Fstype == "devtmpfs" {
				continue
			}
			ov.Disks = append(ov.Disks, DiskInfo{
				Mount: p.Mountpoint, Device: p.Device, Fstype: p.Fstype,
				Total: u.Total, Used: u.Used, Free: u.Free, UsedPercent: u.UsedPercent,
			})
		}
	}
	if ifaces, err := net.IOCounters(true); err == nil {
		for _, iface := range ifaces {
			if iface.Name == "lo" || strings.HasPrefix(iface.Name, "Loopback") {
				continue
			}
			if iface.BytesRecv == 0 && iface.BytesSent == 0 {
				continue
			}
			ov.Network = append(ov.Network, NetInfo{Name: iface.Name, Rx: iface.BytesRecv, Tx: iface.BytesSent})
		}
	}
	return ov, nil
}

func (localCollector) ListProcesses(query string, limit int) ([]ProcessInfo, error) {
	if limit <= 0 || limit > 2000 {
		limit = 500
	}
	procs, err := process.Processes()
	if err != nil {
		return nil, err
	}
	q := strings.ToLower(strings.TrimSpace(query))
	out := make([]ProcessInfo, 0, min(len(procs), limit))
	for _, p := range procs {
		info, err := collectProcess(p)
		if err != nil {
			continue
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

func collectProcess(p *process.Process) (ProcessInfo, error) {
	info := ProcessInfo{PID: p.Pid}
	if name, err := p.Name(); err == nil {
		info.Name = name
	}
	if ppid, err := p.Ppid(); err == nil {
		info.PPID = ppid
	}
	if u, err := p.Username(); err == nil {
		info.User = u
	}
	if cpuPct, err := p.CPUPercent(); err == nil {
		info.CPU = cpuPct
	}
	if memPct, err := p.MemoryPercent(); err == nil {
		info.Mem = float64(memPct)
	}
	if mi, err := p.MemoryInfo(); err == nil && mi != nil {
		info.MemRSS = mi.RSS
	}
	if cmd, err := p.Cmdline(); err == nil {
		info.Cmd = cmd
	}
	if st, err := p.Status(); err == nil && len(st) > 0 {
		info.Status = st[0]
	}
	if info.Name == "" && info.Cmd == "" {
		return info, fmt.Errorf("empty process")
	}
	return info, nil
}

func (localCollector) Kill(pid int32, signal string) error {
	if pid <= 1 {
		return fmt.Errorf("refusing to signal protected pid %d", pid)
	}
	p, err := process.NewProcess(pid)
	if err != nil {
		return err
	}
	sig := strings.ToUpper(strings.TrimSpace(signal))
	switch sig {
	case "", "TERM", "SIGTERM":
		return p.Terminate()
	case "KILL", "SIGKILL":
		return p.Kill()
	case "INT", "SIGINT":
		return p.Terminate()
	default:
		return fmt.Errorf("unsupported signal %q", signal)
	}
}

func (localCollector) ListServices() ([]ServiceInfo, error) {
	switch runtime.GOOS {
	case "linux":
		return listSystemdServicesLocal()
	case "windows":
		return listWindowsServicesLocal()
	default:
		return nil, fmt.Errorf("service management not available on %s", runtime.GOOS)
	}
}

func (localCollector) ServiceAction(unit, action string) error {
	switch runtime.GOOS {
	case "linux":
		return systemctlActionLocal(unit, action)
	case "windows":
		return windowsServiceActionLocal(unit, action)
	default:
		return fmt.Errorf("service management not available on %s", runtime.GOOS)
	}
}
