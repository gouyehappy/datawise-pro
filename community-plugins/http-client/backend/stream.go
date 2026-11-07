package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha1"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/datawise/community-plugin-http-client/internal/rpc"
)

type streamSession struct {
	id     string
	kind   string // websocket | socketio | tcp
	cancel context.CancelFunc
	conn   net.Conn
	br     *bufio.Reader
}

type streamHub struct {
	mu       sync.Mutex
	sessions map[string]*streamSession
}

func newStreamHub() *streamHub {
	return &streamHub{sessions: map[string]*streamSession{}}
}

func (h *streamHub) put(session *streamSession) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if old, ok := h.sessions[session.id]; ok {
		h.closeLocked(old)
	}
	h.sessions[session.id] = session
}

func (h *streamHub) get(id string) *streamSession {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.sessions[id]
}

func (h *streamHub) remove(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if session, ok := h.sessions[id]; ok {
		h.closeLocked(session)
		delete(h.sessions, id)
	}
}

func (h *streamHub) closeLocked(session *streamSession) {
	if session.cancel != nil {
		session.cancel()
	}
	if session.conn != nil {
		_ = session.conn.Close()
		session.conn = nil
	}
}

type streamOpenParams struct {
	SessionID string            `json:"sessionId"`
	Kind      string            `json:"kind"`
	URL       string            `json:"url"`
	Headers   map[string]string `json:"headers"`
	TimeoutMs int               `json:"timeoutMs"`
	VerifyTLS *bool             `json:"verifyTls"`
}

type streamSendParams struct {
	SessionID string `json:"sessionId"`
	Data      string `json:"data"`
	Binary    bool   `json:"binary"`
}

type streamCloseParams struct {
	SessionID string `json:"sessionId"`
}

func (p *plugin) handleStreamOpen(params json.RawMessage, emitter *rpc.Emitter) (any, *rpc.PluginError) {
	var spec streamOpenParams
	if err := decodeParams(params, &spec); err != nil {
		return nil, err
	}
	if strings.TrimSpace(spec.SessionID) == "" {
		return nil, rpc.NewError(-32602, "sessionId is required")
	}
	kind := strings.ToLower(strings.TrimSpace(spec.Kind))
	if kind == "" {
		kind = "websocket"
	}
	timeout := time.Duration(spec.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	verifyTLS := true
	if spec.VerifyTLS != nil {
		verifyTLS = *spec.VerifyTLS
	}

	ctx, cancel := context.WithCancel(context.Background())
	session := &streamSession{id: spec.SessionID, kind: kind, cancel: cancel}

	switch kind {
	case "websocket", "socketio":
		conn, br, dialErr := dialWebSocket(ctx, strings.TrimSpace(spec.URL), spec.Headers, timeout, verifyTLS)
		if dialErr != nil {
			cancel()
			return nil, rpc.NewError(-32000, "websocket dial failed: "+dialErr.Error())
		}
		session.conn = conn
		session.br = br
		p.streams.put(session)
		emitter.Event("stream/open", map[string]any{"sessionId": session.id, "kind": kind})
		go p.readWebSocketFrames(session, emitter)
	case "tcp":
		addr := strings.TrimSpace(spec.URL)
		dialer := net.Dialer{Timeout: timeout}
		conn, dialErr := dialer.DialContext(ctx, "tcp", addr)
		if dialErr != nil {
			cancel()
			return nil, rpc.NewError(-32000, "tcp dial failed: "+dialErr.Error())
		}
		session.conn = conn
		session.br = bufio.NewReader(conn)
		p.streams.put(session)
		emitter.Event("stream/open", map[string]any{"sessionId": session.id, "kind": kind})
		go p.readTCP(session, emitter)
	default:
		cancel()
		return nil, rpc.NewError(-32602, "unsupported stream kind: "+kind)
	}
	return map[string]any{"ok": true, "sessionId": session.id, "kind": kind}, nil
}

func (p *plugin) handleStreamSend(params json.RawMessage) (any, *rpc.PluginError) {
	var spec streamSendParams
	if err := decodeParams(params, &spec); err != nil {
		return nil, err
	}
	session := p.streams.get(spec.SessionID)
	if session == nil {
		return nil, rpc.NewError(-32000, "session not found")
	}
	payload := []byte(spec.Data)
	switch session.kind {
	case "websocket", "socketio":
		opcode := byte(0x1) // text
		if spec.Binary {
			opcode = 0x2
		}
		if err := writeWSFrame(session.conn, opcode, payload); err != nil {
			return nil, rpc.NewError(-32000, "websocket send failed: "+err.Error())
		}
	case "tcp":
		_ = session.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		if _, err := session.conn.Write(payload); err != nil {
			return nil, rpc.NewError(-32000, "tcp send failed: "+err.Error())
		}
	default:
		return nil, rpc.NewError(-32602, "unsupported stream kind")
	}
	return map[string]any{"ok": true}, nil
}

func (p *plugin) handleStreamClose(params json.RawMessage, emitter *rpc.Emitter) (any, *rpc.PluginError) {
	var spec streamCloseParams
	if err := decodeParams(params, &spec); err != nil {
		return nil, err
	}
	p.streams.remove(spec.SessionID)
	emitter.Event("stream/close", map[string]any{"sessionId": spec.SessionID, "reason": "client"})
	return map[string]any{"ok": true}, nil
}

func (p *plugin) readWebSocketFrames(session *streamSession, emitter *rpc.Emitter) {
	defer func() {
		p.streams.remove(session.id)
		emitter.Event("stream/close", map[string]any{"sessionId": session.id, "reason": "eof"})
	}()
	for {
		opcode, data, err := readWSFrame(session.br)
		if err != nil {
			if err != io.EOF && !strings.Contains(err.Error(), "closed") {
				emitter.Event("stream/error", map[string]any{"sessionId": session.id, "message": err.Error()})
			}
			return
		}
		if opcode == 0x8 { // close
			return
		}
		if opcode == 0x9 { // ping → pong
			_ = writeWSFrame(session.conn, 0xA, data)
			continue
		}
		if opcode == 0xA { // pong
			continue
		}
		emitter.Event("stream/message", map[string]any{
			"sessionId": session.id,
			"kind":      session.kind,
			"binary":    opcode == 0x2,
			"data":      string(data),
			"size":      len(data),
		})
	}
}

func (p *plugin) readTCP(session *streamSession, emitter *rpc.Emitter) {
	defer func() {
		p.streams.remove(session.id)
		emitter.Event("stream/close", map[string]any{"sessionId": session.id, "reason": "eof"})
	}()
	buf := make([]byte, 8192)
	for {
		n, err := session.br.Read(buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])
			emitter.Event("stream/message", map[string]any{
				"sessionId": session.id,
				"kind":      "tcp",
				"binary":    false,
				"data":      string(chunk),
				"size":      n,
			})
		}
		if err != nil {
			if err != io.EOF {
				emitter.Event("stream/error", map[string]any{"sessionId": session.id, "message": err.Error()})
			}
			return
		}
	}
}

/* ---------------- minimal RFC6455 client (stdlib only) ---------------- */

func dialWebSocket(ctx context.Context, rawURL string, headers map[string]string, timeout time.Duration, verifyTLS bool) (net.Conn, *bufio.Reader, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil, nil, err
	}
	scheme := strings.ToLower(parsed.Scheme)
	host := parsed.Host
	if host == "" {
		return nil, nil, io.ErrUnexpectedEOF
	}
	if !strings.Contains(host, ":") {
		if scheme == "wss" || scheme == "https" {
			host += ":443"
		} else {
			host += ":80"
		}
	}
	dialer := net.Dialer{Timeout: timeout}
	var conn net.Conn
	if scheme == "wss" || scheme == "https" {
		tlsConfig := &tls.Config{ServerName: parsed.Hostname(), InsecureSkipVerify: !verifyTLS} //nolint:gosec
		conn, err = tls.DialWithDialer(&dialer, "tcp", host, tlsConfig)
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", host)
	}
	if err != nil {
		return nil, nil, err
	}

	key := make([]byte, 16)
	_, _ = rand.Read(key)
	keyB64 := base64.StdEncoding.EncodeToString(key)

	path := parsed.RequestURI()
	if path == "" {
		path = "/"
	}
	var req strings.Builder
	req.WriteString("GET " + path + " HTTP/1.1\r\n")
	req.WriteString("Host: " + parsed.Host + "\r\n")
	req.WriteString("Upgrade: websocket\r\n")
	req.WriteString("Connection: Upgrade\r\n")
	req.WriteString("Sec-WebSocket-Key: " + keyB64 + "\r\n")
	req.WriteString("Sec-WebSocket-Version: 13\r\n")
	for k, v := range headers {
		if strings.TrimSpace(k) == "" {
			continue
		}
		lower := strings.ToLower(k)
		if lower == "host" || lower == "upgrade" || lower == "connection" || lower == "sec-websocket-key" || lower == "sec-websocket-version" {
			continue
		}
		req.WriteString(k + ": " + v + "\r\n")
	}
	req.WriteString("\r\n")
	_ = conn.SetDeadline(time.Now().Add(timeout))
	if _, err = io.WriteString(conn, req.String()); err != nil {
		_ = conn.Close()
		return nil, nil, err
	}

	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, &http.Request{Method: http.MethodGet})
	if err != nil {
		_ = conn.Close()
		return nil, nil, err
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		_ = conn.Close()
		return nil, nil, io.ErrUnexpectedEOF
	}
	accept := resp.Header.Get("Sec-WebSocket-Accept")
	expect := wsAccept(keyB64)
	if accept != expect {
		_ = conn.Close()
		return nil, nil, io.ErrUnexpectedEOF
	}
	_ = conn.SetDeadline(time.Time{})
	return conn, br, nil
}

func wsAccept(key string) string {
	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	return base64.StdEncoding.EncodeToString(sum[:])
}

func writeWSFrame(conn net.Conn, opcode byte, payload []byte) error {
	_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	header := []byte{0x80 | opcode}
	n := len(payload)
	maskKey := make([]byte, 4)
	_, _ = rand.Read(maskKey)
	switch {
	case n < 126:
		header = append(header, byte(0x80|n))
	case n < 65536:
		header = append(header, 0x80|126, byte(n>>8), byte(n))
	default:
		header = append(header, 0x80|127)
		lenBuf := make([]byte, 8)
		binary.BigEndian.PutUint64(lenBuf, uint64(n))
		header = append(header, lenBuf...)
	}
	header = append(header, maskKey...)
	masked := make([]byte, n)
	for i := 0; i < n; i++ {
		masked[i] = payload[i] ^ maskKey[i%4]
	}
	if _, err := conn.Write(header); err != nil {
		return err
	}
	_, err := conn.Write(masked)
	return err
}

func readWSFrame(br *bufio.Reader) (byte, []byte, error) {
	h1, err := br.ReadByte()
	if err != nil {
		return 0, nil, err
	}
	h2, err := br.ReadByte()
	if err != nil {
		return 0, nil, err
	}
	opcode := h1 & 0x0f
	masked := h2&0x80 != 0
	length := int(h2 & 0x7f)
	switch length {
	case 126:
		var ext [2]byte
		if _, err = io.ReadFull(br, ext[:]); err != nil {
			return 0, nil, err
		}
		length = int(binary.BigEndian.Uint16(ext[:]))
	case 127:
		var ext [8]byte
		if _, err = io.ReadFull(br, ext[:]); err != nil {
			return 0, nil, err
		}
		length = int(binary.BigEndian.Uint64(ext[:]))
	}
	var maskKey [4]byte
	if masked {
		if _, err = io.ReadFull(br, maskKey[:]); err != nil {
			return 0, nil, err
		}
	}
	payload := make([]byte, length)
	if length > 0 {
		if _, err = io.ReadFull(br, payload); err != nil {
			return 0, nil, err
		}
		if masked {
			for i := 0; i < length; i++ {
				payload[i] ^= maskKey[i%4]
			}
		}
	}
	return opcode, payload, nil
}
