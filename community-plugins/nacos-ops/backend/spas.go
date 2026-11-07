package main

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

/** spasResource: empty tenant → group; else group+'+'+tenant (Nacos Java client). */
func spasResource(group, tenant string) string {
	if tenant == "" {
		return group
	}
	return group + "+" + tenant
}

/** spasSignPayload is the HMAC-SHA1 input: resource+"+"+ts when resource set, else ts. */
func spasSignPayload(timestamp, group, tenant string) string {
	resource := spasResource(group, tenant)
	if resource == "" {
		return timestamp
	}
	return resource + "+" + timestamp
}

/** spasSignature returns Base64(HMAC-SHA1(secret, payload)). */
func spasSignature(secret, timestamp, group, tenant string) string {
	mac := hmac.New(sha1.New, []byte(secret))
	_, _ = mac.Write([]byte(spasSignPayload(timestamp, group, tenant)))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func extractSpasGroupTenant(query, form url.Values) (group, tenant string) {
	if form != nil {
		group = firstNonEmpty(form.Get("group"), form.Get("groupName"))
		tenant = firstNonEmpty(form.Get("tenant"), form.Get("namespaceId"), form.Get("namespace"))
	}
	if query != nil {
		if group == "" {
			group = firstNonEmpty(query.Get("group"), query.Get("groupName"))
		}
		if tenant == "" {
			tenant = firstNonEmpty(query.Get("tenant"), query.Get("namespaceId"), query.Get("namespace"))
		}
	}
	return group, tenant
}

/** signSpasHeaders sets Aliyun Spas auth headers when AK/SK are present. */
func signSpasHeaders(req *http.Request, accessKey, secretKey, group, tenant string) {
	if accessKey == "" || secretKey == "" || req == nil {
		return
	}
	ts := strconv.FormatInt(time.Now().UnixMilli(), 10)
	req.Header.Set("Spas-AccessKey", accessKey)
	req.Header.Set("Timestamp", ts)
	req.Header.Set("Spas-Signature", spasSignature(secretKey, ts, group, tenant))
}
