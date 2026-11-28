// Package rpc implements a minimal DataWise community-plugin stdio-jsonl server.
// Wire format matches _private/docs/design/COMMUNITY_PLUGIN.md (JSON-RPC 2.0, one object per line).
package rpc

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"
)

const ProtocolVersion = 1

// maxFrameSize is the maximum size of a single inbound JSONL frame. It is
// generous enough to hold a 32 MiB body transported as base64 (~43 MiB after
// encoding) plus JSON framing overhead, while preventing unbounded allocation
// on a peer that never terminates a line.
const maxFrameSize = 128 << 20 // 128 MiB

// PluginError is a JSON-RPC error returned to the host.
type PluginError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

func NewError(code int, message string) *PluginError {
	return &PluginError{Code: code, Message: message}
}

func MethodNotFound(method string) *PluginError {
	return NewError(-32601, "Method not found: "+method)
}

// RequestContext carries the inbound request id (if any).
type RequestContext struct {
	RequestID *int64
}

// Metadata describes the plugin for initialize negotiation.
type Metadata struct {
	ID           string
	Version      string
	Capabilities []string
}

// Emitter writes JSON-RPC notifications (events) to the host on stdout.
type Emitter struct {
	mu  *sync.Mutex
	out io.Writer
}

func (e *Emitter) Event(method string, params any) error {
	if e == nil || e.mu == nil || e.out == nil {
		return nil
	}
	if params == nil {
		params = map[string]any{}
	}
	return e.write(map[string]any{
		"jsonrpc": "2.0",
		"method":  method,
		"params":  params,
	})
}

func (e *Emitter) write(payload any) error {
	if e == nil || e.mu == nil || e.out == nil {
		return nil
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if _, err := e.out.Write(raw); err != nil {
		return err
	}
	_, err = e.out.Write([]byte("\n"))
	return err
}

// DiscardEmitter returns an emitter that drops all notifications.
func DiscardEmitter() *Emitter {
	return &Emitter{}
}

func (e *Emitter) respond(id int64, result any, rpcErr *PluginError) error {
	payload := map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
	}
	if rpcErr != nil {
		payload["error"] = rpcErr
	} else {
		if result == nil {
			result = map[string]any{}
		}
		payload["result"] = result
	}
	return e.write(payload)
}

// Handler is the plugin business surface.
type Handler interface {
	Handle(ctx RequestContext, method string, params json.RawMessage, emitter *Emitter) (any, *PluginError)
}

// Server reads JSON-RPC requests from stdin and writes responses/events to stdout.
type Server struct {
	metadata Metadata
	handler  Handler
}

func NewServer(metadata Metadata, handler Handler) *Server {
	return &Server{metadata: metadata, handler: handler}
}

type inbound struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      *flexibleID     `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type flexibleID struct {
	Int *int64
}

func (id *flexibleID) UnmarshalJSON(data []byte) error {
	var asInt int64
	if err := json.Unmarshal(data, &asInt); err == nil {
		id.Int = &asInt
		return nil
	}
	var asStr string
	if err := json.Unmarshal(data, &asStr); err == nil {
		var parsed int64
		if _, err := fmt.Sscan(asStr, &parsed); err == nil {
			id.Int = &parsed
			return nil
		}
		return nil
	}
	return fmt.Errorf("unsupported json-rpc id")
}

func (s *Server) Serve() error {
	return s.ServeIO(os.Stdin, os.Stdout)
}

func (s *Server) ServeIO(in io.Reader, out io.Writer) error {
	var writeMu sync.Mutex
	emitter := &Emitter{mu: &writeMu, out: out}
	reader := bufio.NewReader(in)
	for {
		line, err := readFrame(reader)
		if len(line) > 0 {
			payload := trimSpace(line)
			if len(payload) > 0 {
				s.dispatch(payload, emitter)
			}
		}
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
	}
}

// readFrame reads a newline-terminated line from r, mirroring
// bufio.Reader.ReadBytes but capping the frame at maxFrameSize. On overflow it
// returns a descriptive error instead of growing the buffer without bound.
// The EOF/data semantics match ReadBytes so the existing ServeIO error path is
// unchanged.
func readFrame(r *bufio.Reader) ([]byte, error) {
	var line []byte
	for {
		chunk, err := r.ReadSlice('\n')
		if len(line)+len(chunk) > maxFrameSize {
			return nil, fmt.Errorf("rpc: inbound frame exceeds maximum size of %d bytes", maxFrameSize)
		}
		line = append(line, chunk...)
		if err == nil {
			return line, nil
		}
		if err == bufio.ErrBufferFull {
			continue
		}
		return line, err
	}
}

func trimSpace(b []byte) []byte {
	start, end := 0, len(b)
	for start < end && (b[start] == ' ' || b[start] == '\t' || b[start] == '\r' || b[start] == '\n') {
		start++
	}
	for end > start && (b[end-1] == ' ' || b[end-1] == '\t' || b[end-1] == '\r' || b[end-1] == '\n') {
		end--
	}
	return b[start:end]
}

func (s *Server) dispatch(payload []byte, emitter *Emitter) {
	var req inbound
	if err := json.Unmarshal(payload, &req); err != nil {
		fmt.Fprintf(os.Stderr, "[http-client-rpc] bad request: %v\n", err)
		return
	}
	if req.Method == "" {
		return
	}
	// Notifications (no id): ignore unless we later need host→plugin notifies.
	if req.ID == nil || req.ID.Int == nil {
		return
	}
	id := *req.ID.Int
	params := req.Params
	if len(params) == 0 {
		params = json.RawMessage("{}")
	}

	if req.Method == "plugin/initialize" {
		result := s.initializeResult(params)
		if err := emitter.respond(id, result, nil); err != nil {
			fmt.Fprintf(os.Stderr, "[http-client-rpc] respond initialize: %v\n", err)
		}
		return
	}

	go func() {
		ctx := RequestContext{RequestID: &id}
		result, rpcErr := s.handler.Handle(ctx, req.Method, params, emitter)
		if err := emitter.respond(id, result, rpcErr); err != nil {
			fmt.Fprintf(os.Stderr, "[http-client-rpc] respond %s: %v\n", req.Method, err)
		}
	}()
}

func (s *Server) initializeResult(params json.RawMessage) any {
	supported := true
	var envelope struct {
		Host struct {
			ProtocolVersions []int `json:"protocolVersions"`
		} `json:"host"`
		ProtocolVersion int `json:"protocolVersion"`
	}
	_ = json.Unmarshal(params, &envelope)
	if len(envelope.Host.ProtocolVersions) > 0 {
		supported = false
		for _, v := range envelope.Host.ProtocolVersions {
			if v == ProtocolVersion {
				supported = true
				break
			}
		}
	} else if envelope.ProtocolVersion != 0 && envelope.ProtocolVersion != ProtocolVersion {
		supported = false
	}
	if !supported {
		return map[string]any{"ok": false, "error": "protocol version mismatch"}
	}
	return map[string]any{
		"ok":              true,
		"protocolVersion": ProtocolVersion,
		"capabilities":    s.metadata.Capabilities,
		"plugin": map[string]any{
			"id":      s.metadata.ID,
			"version": s.metadata.Version,
		},
	}
}
