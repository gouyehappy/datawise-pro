module github.com/datawise/community-plugin-process-ops

go 1.22

require (
	github.com/shirou/gopsutil/v4 v4.24.12
	github.com/t8y2/dbx/plugins/sdk/go/dbx-plugin-sdk v0.1.0
	golang.org/x/crypto v0.31.0
)

require (
	github.com/ebitengine/purego v0.8.1 // indirect
	github.com/go-ole/go-ole v1.2.6 // indirect
	github.com/lufia/plan9stats v0.0.0-20211012122336-39d0f177ccd0 // indirect
	github.com/power-devops/perfstat v0.0.0-20210106213030-5aafc221ea8c // indirect
	github.com/tklauser/go-sysconf v0.3.12 // indirect
	github.com/tklauser/numcpus v0.6.1 // indirect
	github.com/yusufpapurcu/wmi v1.2.4 // indirect
	golang.org/x/sys v0.28.0 // indirect
)

replace github.com/t8y2/dbx/plugins/sdk/go/dbx-plugin-sdk => ./sdk
