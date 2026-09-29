// Package gateway exposes exactly one tailnet service to an authenticated WebView.
// It is not a forward proxy. All outbound sockets use the supplied tsnet dialer.
package gateway

import (
 "context"
 "crypto/rand"
 "crypto/subtle"
 "encoding/hex"
 "errors"
 "fmt"
 "io"
 "net"
 "net/http"
 "net/http/httputil"
 "net/netip"
 "net/url"
 "strconv"
 "strings"
 "sync"
 "time"
)

const CookieName = "axiom_local_session"
type Dialer func(context.Context, string, string) (net.Conn, error)

// ParseTarget accepts only Tailscale IPs or full MagicDNS names, never userinfo,
// arbitrary public hosts, paths, queries, or fragments.
func ParseTarget(raw string) (*url.URL, error) {
 raw = strings.TrimSpace(raw)
 if !strings.Contains(raw, "://") { raw = "http://" + raw }
 u, err := url.Parse(raw)
 if err != nil || u.Host == "" || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" || u.Opaque != "" { return nil, errors.New("请输入 Tailscale IP 或完整 .ts.net 地址，不要包含路径或登录信息") }
 host := strings.ToLower(u.Hostname())
 if ip, e := netip.ParseAddr(host); e == nil {
  if !netip.MustParsePrefix("100.64.0.0/10").Contains(ip) && !netip.MustParsePrefix("fd7a:115c:a1e0::/48").Contains(ip) { return nil, errors.New("仅允许 Tailscale 私网 IP") }
 } else {
  if !strings.HasSuffix(host, ".ts.net") || len(host) > 253 { return nil, errors.New("请使用完整的设备名.xxx.ts.net，而不是公网域名或短主机名") }
  for _, label := range strings.Split(host, ".") {
   if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' { return nil, errors.New("无效的 MagicDNS 名称") }
   for _, c := range label { if !(c >= 'a' && c <= 'z') && !(c >= '0' && c <= '9') && c != '-' { return nil, errors.New("无效的 MagicDNS 名称") } }
  }
 }
 port := u.Port()
 if port == "" { if u.Scheme == "https" { port = "443" } else { port = "4319" } }
 p, e := strconv.Atoi(port)
 if e != nil || p < 1 || p > 65535 { return nil, errors.New("端口必须为 1–65535") }
 u.Host = net.JoinHostPort(host, strconv.Itoa(p)); u.Path = ""; u.RawPath = ""
 return u, nil
}

type Gateway struct {
 listener net.Listener
 server *http.Server
 transport *http.Transport
 target *url.URL
 token string
 origin string
 expires time.Time
 mu sync.Mutex
 conns map[*trackedConn]bool
 closed bool
}
type trackedConn struct { net.Conn; owner *Gateway }
func (c *trackedConn) Close() error { c.owner.mu.Lock(); delete(c.owner.conns, c); c.owner.mu.Unlock(); return c.Conn.Close() }

func New(target *url.URL, dial Dialer) (*Gateway, error) {
 privateTarget := *target
 target = &privateTarget
 token := make([]byte, 32)
 if _, err := rand.Read(token); err != nil { return nil, err }
 listener, err := net.Listen("tcp4", "127.0.0.1:0")
 if err != nil { return nil, err }
 g := &Gateway{listener: listener, target: target, token: hex.EncodeToString(token), origin: "http://"+listener.Addr().String(), expires: time.Now().Add(24*time.Hour), conns: make(map[*trackedConn]bool)}
 g.transport = &http.Transport{Proxy: nil, ForceAttemptHTTP2: false, ResponseHeaderTimeout: 30*time.Second, IdleConnTimeout: 60*time.Second, MaxIdleConns: 8, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
  // Defense in depth: ReverseProxy must never cause a second destination.
  if address != target.Host { return nil, errors.New("destination rejected") }
  ctx, cancel := context.WithTimeout(ctx, 30*time.Second); defer cancel()
  c, err := dial(ctx, network, address); if err != nil { return nil, err }
  tc := &trackedConn{Conn: c, owner: g}
  g.mu.Lock(); defer g.mu.Unlock()
  if g.closed { c.Close(); return nil, net.ErrClosed }; g.conns[tc] = true
  return tc, nil
 }}
 proxy := &httputil.ReverseProxy{Transport: g.transport, FlushInterval: -1, Rewrite: func(p *httputil.ProxyRequest) {
  p.SetURL(target); p.Out.Host = target.Host
  p.Out.Header.Del("Cookie") // This service uses tailnet identity, not upstream cookies.
  p.Out.Header.Del("Authorization"); p.Out.Header.Del("Proxy-Authorization")
  p.Out.Header.Del("Forwarded"); p.Out.Header.Del("X-Forwarded-For"); p.Out.Header.Del("X-Forwarded-Host"); p.Out.Header.Del("X-Forwarded-Proto")
  if p.In.Header.Get("Origin") != "" { p.Out.Header.Set("Origin", target.Scheme+"://"+target.Host) }
  p.Out.Header.Del("Referer")
 }, ModifyResponse: g.modifyResponse, ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) { http.Error(w, "无法连接 Axiom，请确认电脑在线、远程入口已开启且登录账号一致。", http.StatusBadGateway) }}
 g.server = &http.Server{Handler: g.authenticate(proxy), ReadHeaderTimeout: 10*time.Second, IdleTimeout: 60*time.Second, MaxHeaderBytes: 64<<10}
 go func() { _ = g.server.Serve(listener) }()
 return g, nil
}
func (g *Gateway) URL() string { return g.origin }
func (g *Gateway) Token() string { return g.token }
func (g *Gateway) Renew() { g.mu.Lock(); g.expires = time.Now().Add(24*time.Hour); g.mu.Unlock() }
func (g *Gateway) Close() {
 g.mu.Lock(); g.closed = true; g.expires = time.Time{}; cs := make([]*trackedConn,0,len(g.conns)); for c := range g.conns { cs=append(cs,c) }; g.mu.Unlock()
 _ = g.server.Close(); g.transport.CloseIdleConnections(); for _, c := range cs { _ = c.Close() }
}
func (g *Gateway) authenticate(next http.Handler) http.Handler {
 return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
  w.Header().Set("Cache-Control", "no-store")
  w.Header().Set("Referrer-Policy", "no-referrer")
  g.mu.Lock(); active := !g.closed && time.Now().Before(g.expires); g.mu.Unlock()
  valid := active && r.Host == g.listener.Addr().String() && !r.URL.IsAbs() && r.Method != http.MethodConnect
  count := 0; credential := ""
  for _, c := range r.Cookies() { if c.Name == CookieName { count++; credential=c.Value } }
  valid = valid && count == 1 && len(credential) == len(g.token) && subtle.ConstantTimeCompare([]byte(credential), []byte(g.token)) == 1
  origins := r.Header.Values("Origin"); origin := r.Header.Get("Origin")
  if len(origins) > 1 || (origin != "" && origin != g.origin) { valid=false }
  if (strings.EqualFold(r.Header.Get("Upgrade"), "websocket") || (r.Method != "GET" && r.Method != "HEAD")) && origin != g.origin { valid=false }
  if r.Header.Get("Sec-Fetch-Site") == "cross-site" { valid=false }
  if !valid { http.Error(w, "本地会话无效，请返回连接页重试。", http.StatusForbidden); return }
  next.ServeHTTP(w,r)
 })
}
func (g *Gateway) modifyResponse(r *http.Response) error {
 r.Header.Del("Set-Cookie")
 r.Header.Del("Clear-Site-Data")
 r.Header.Del("Refresh")
 r.Header.Del("Alt-Svc")
 r.Header.Set("Cache-Control", "no-store")
 r.Header.Set("Referrer-Policy", "no-referrer")
 r.Header.Set("X-Content-Type-Options", "nosniff")
 // Replace upstream CSP with a stricter local-origin policy. Explicit WS origin
 // avoids WebView 'self' interpretation differences. Never allow other ports.
 ws := "ws"+strings.TrimPrefix(g.origin,"http")
 r.Header.Set("Content-Security-Policy", fmt.Sprintf("default-src %s; script-src %s; style-src %s 'unsafe-inline'; img-src %s data: blob:; font-src %s; connect-src %s %s; frame-src 'none'; frame-ancestors 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'", g.origin,g.origin,g.origin,g.origin,g.origin,g.origin,ws))
 if loc := r.Header.Get("Location"); loc != "" {
  u, err := url.Parse(loc); if err != nil { return errors.New("invalid redirect") }
  resolved := g.target.ResolveReference(u)
  if resolved.Scheme != g.target.Scheme || resolved.Host != g.target.Host || resolved.User != nil { return errors.New("external redirect rejected") }
  local, _ := url.Parse(g.origin); resolved.Scheme=local.Scheme; resolved.Host=local.Host
  r.Header.Set("Location", resolved.String())
 }
 return nil
}

// Probe uses the gateway only after node connectivity is established. It never
// includes a body or URL in errors (credentials and remote content stay private).
func (g *Gateway) Probe() error {
 req, _ := http.NewRequest("GET",g.origin+"/health",nil)
 req.AddCookie(&http.Cookie{Name:CookieName,Value:g.token})
 c := &http.Client{Timeout:12*time.Second, CheckRedirect:func(*http.Request,[]*http.Request)error{return http.ErrUseLastResponse}}
 resp, err := c.Do(req); if err != nil { return errors.New("远端健康检查失败，请检查网络") }
 defer resp.Body.Close(); _, _ = io.Copy(io.Discard,io.LimitReader(resp.Body,4096))
 if resp.StatusCode != 200 { return fmt.Errorf("远端返回 HTTP %d，请检查 Tailscale 账号和 Axiom 远程权限",resp.StatusCode) }
 return nil
}
