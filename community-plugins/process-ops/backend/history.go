package main

import (
	"sync"
	"time"
)

const historyCapacity = 60

type metricRing struct {
	mu      sync.Mutex
	cpu     []HistorySample
	mem     []HistorySample
	load1   []HistorySample
}

func newMetricRing() *metricRing {
	return &metricRing{}
}

func (r *metricRing) push(cpu, mem, load1 float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ts := time.Now().UnixMilli()
	r.cpu = appendSample(r.cpu, HistorySample{TS: ts, Value: cpu})
	r.mem = appendSample(r.mem, HistorySample{TS: ts, Value: mem})
	r.load1 = appendSample(r.load1, HistorySample{TS: ts, Value: load1})
}

func appendSample(buf []HistorySample, s HistorySample) []HistorySample {
	buf = append(buf, s)
	if len(buf) > historyCapacity {
		buf = buf[len(buf)-historyCapacity:]
	}
	return buf
}

func (r *metricRing) snapshot(metric string) []HistorySample {
	r.mu.Lock()
	defer r.mu.Unlock()
	var src []HistorySample
	switch metric {
	case "mem":
		src = r.mem
	case "load1":
		src = r.load1
	default:
		src = r.cpu
	}
	out := make([]HistorySample, len(src))
	copy(out, src)
	return out
}
