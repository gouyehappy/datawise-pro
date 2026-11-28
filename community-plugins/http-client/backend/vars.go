package main

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var varPattern = regexp.MustCompile(`\{\{\s*([^{}]+?)\s*\}\}`)

// resolveVars replaces {{name}} placeholders. Names starting with $ are dynamic
// (Postman-compatible). round is exposed as {{$round}} for workflow loops.
func resolveVars(text string, vars map[string]string, round int) string {
	if text == "" {
		return text
	}
	return varPattern.ReplaceAllStringFunc(text, func(match string) string {
		sub := varPattern.FindStringSubmatch(match)
		if len(sub) < 2 {
			return match
		}
		name := strings.TrimSpace(sub[1])
		if strings.HasPrefix(name, "$") {
			if value, ok := dynamicVar(name, round); ok {
				return value
			}
		}
		if vars != nil {
			if value, ok := vars[name]; ok {
				return value
			}
		}
		return match
	})
}

func dynamicVar(name string, round int) (string, bool) {
	now := time.Now()
	switch name {
	case "$uuid", "$guid":
		return newUUID(), true
	case "$timestamp":
		return strconv.FormatInt(now.Unix(), 10), true
	case "$timestampMs":
		return strconv.FormatInt(now.UnixMilli(), 10), true
	case "$isoTimestamp":
		return now.UTC().Format(time.RFC3339Nano), true
	case "$date":
		return now.Format("2006-01-02"), true
	case "$time":
		return now.Format("15:04:05"), true
	case "$datetime":
		return now.Format("2006-01-02 15:04:05"), true
	case "$year":
		return strconv.Itoa(now.Year()), true
	case "$month":
		return fmt.Sprintf("%02d", int(now.Month())), true
	case "$day":
		return fmt.Sprintf("%02d", now.Day()), true
	case "$randomInt":
		return strconv.FormatInt(randInt(1000), 10), true
	case "$randomFloat":
		return fmt.Sprintf("%.6f", float64(randInt(1_000_000))/1000.0), true
	case "$randomBoolean":
		if randInt(2) == 0 {
			return "false", true
		}
		return "true", true
	case "$randomString", "$randomAlphaNumeric":
		return randomAlphaNumeric(10), true
	case "$randomHex":
		return randomHex(8), true
	case "$randomEmail":
		return "user_" + strings.ToLower(randomAlphaNumeric(8)) + "@example.com", true
	case "$randomIpv4":
		return fmt.Sprintf("%d.%d.%d.%d", 1+randInt(223), randInt(256), randInt(256), randInt(256)), true
	case "$round":
		return strconv.Itoa(round), true
	default:
		return "", false
	}
}

func randInt(max int64) int64 {
	if max <= 0 {
		return 0
	}
	n, err := rand.Int(rand.Reader, big.NewInt(max))
	if err != nil {
		return time.Now().UnixNano() % max
	}
	return n.Int64()
}

func randomHex(length int) string {
	const alphabet = "0123456789abcdef"
	out := make([]byte, length)
	for i := 0; i < length; i++ {
		out[i] = alphabet[randInt(16)]
	}
	return string(out)
}

func randomAlphaNumeric(length int) string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	out := make([]byte, length)
	for i := 0; i < length; i++ {
		out[i] = alphabet[randInt(int64(len(alphabet)))]
	}
	return string(out)
}

func newUUID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}
