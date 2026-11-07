package main

import "time"

type TargetKind string

const (
	TargetLocal TargetKind = "local"
	TargetSSH   TargetKind = "ssh"
)

// TargetRole distinguishes bastion jump hosts from service hosts.
type TargetRole string

const (
	RoleBastion TargetRole = "bastion"
	RoleHost    TargetRole = "host"
)

// JumpSpec is the bastion endpoint used for ProxyJump / JumpServer dials.
type JumpSpec struct {
	Host             string `json:"host,omitempty"`
	Port             int    `json:"port,omitempty"`
	User             string `json:"user,omitempty"`
	Password         string `json:"password,omitempty"`
	PrivateKey       string `json:"privateKey,omitempty"`
	Passphrase       string `json:"passphrase,omitempty"`
	TrustedHostKey   string `json:"trustedHostKey,omitempty"`
	AcceptNewHostKey bool   `json:"acceptNewHostKey,omitempty"`
	BastionKind      string `json:"bastionKind,omitempty"` // ssh | jumpserver
	WebPort          int    `json:"webPort,omitempty"`
}

type TargetSpec struct {
	ID               string     `json:"id"`
	DisplayName      string     `json:"displayName"`
	Kind             TargetKind `json:"kind"`
	Role             TargetRole `json:"role,omitempty"` // bastion | host (default host)
	Via              string     `json:"via,omitempty"`  // bastion target id
	Jump             *JumpSpec  `json:"jump,omitempty"` // resolved bastion creds for Via dials
	BastionKind      string     `json:"bastionKind,omitempty"` // ssh | jumpserver
	WebPort          int        `json:"webPort,omitempty"`     // JumpServer HTTP API (default 801)
	MenuID           string     `json:"menuId,omitempty"`      // JumpServer Opt> asset id
	Host             string     `json:"host,omitempty"`
	Port             int        `json:"port,omitempty"`
	User             string     `json:"user,omitempty"`
	Password         string     `json:"password,omitempty"`
	PrivateKey       string     `json:"privateKey,omitempty"`
	Passphrase       string     `json:"passphrase,omitempty"`
	TrustedHostKey   string     `json:"trustedHostKey,omitempty"`  // base64(ssh.PublicKey.Marshal())
	AcceptNewHostKey bool       `json:"acceptNewHostKey,omitempty"` // trust presented key this dial
}

type DiscoverItem struct {
	Host    string `json:"host"`
	Port    int    `json:"port,omitempty"`
	Name    string `json:"name,omitempty"`
	User    string `json:"user,omitempty"`
	Source  string `json:"source,omitempty"`
	MenuID  string `json:"menuId,omitempty"`
	AssetID string `json:"assetId,omitempty"`
	Comment string `json:"comment,omitempty"`
}

type Overview struct {
	TargetID     string      `json:"targetId"`
	Kind         TargetKind  `json:"kind"`
	OS           string      `json:"os"`
	Hostname     string      `json:"hostname"`
	UptimeSec    int64       `json:"uptimeSec"`
	CPUPercent   float64     `json:"cpuPercent"`
	CPUCount     int         `json:"cpuCount"`
	Load1        float64     `json:"load1"`
	Load5        float64     `json:"load5"`
	Load15       float64     `json:"load15"`
	MemTotal     uint64      `json:"memTotal"`
	MemUsed      uint64      `json:"memUsed"`
	MemAvailable uint64      `json:"memAvailable"`
	MemPercent   float64     `json:"memPercent"`
	Disks        []DiskInfo  `json:"disks"`
	Network      []NetInfo   `json:"network"`
	CollectedAt  time.Time   `json:"collectedAt"`
	LinuxCapable bool        `json:"linuxCapable"`
}

type DiskInfo struct {
	Mount      string  `json:"mount"`
	Device     string  `json:"device"`
	Fstype     string  `json:"fstype"`
	Total      uint64  `json:"total"`
	Used       uint64  `json:"used"`
	Free       uint64  `json:"free"`
	UsedPercent float64 `json:"usedPercent"`
}

type NetInfo struct {
	Name string `json:"name"`
	Rx   uint64 `json:"rx"`
	Tx   uint64 `json:"tx"`
}

type ProcessInfo struct {
	PID     int32   `json:"pid"`
	PPID    int32   `json:"ppid"`
	Name    string  `json:"name"`
	User    string  `json:"user"`
	CPU     float64 `json:"cpu"`
	Mem     float64 `json:"mem"`
	MemRSS  uint64  `json:"memRss"`
	Cmd     string  `json:"cmd"`
	Status  string  `json:"status,omitempty"`
}

type ServiceInfo struct {
	Unit        string `json:"unit"`
	Load        string `json:"load"`
	Active      string `json:"active"`
	Sub         string `json:"sub"`
	Description string `json:"description"`
}

type DiagnoseFinding struct {
	Severity string `json:"severity"` // info | warn | critical
	Code     string `json:"code"`
	Title    string `json:"title"`
	Detail   string `json:"detail"`
}

type DiagnoseReport struct {
	TargetID    string            `json:"targetId"`
	CollectedAt time.Time         `json:"collectedAt"`
	Summary     string            `json:"summary"`
	Findings    []DiagnoseFinding `json:"findings"`
	TopCPU      []ProcessInfo     `json:"topCpu"`
	TopMem      []ProcessInfo     `json:"topMem"`
	OOMSnippet  string            `json:"oomSnippet,omitempty"`
	Overview    *Overview         `json:"overview,omitempty"`
}

type HistorySample struct {
	TS    int64   `json:"ts"`
	Value float64 `json:"value"`
}
