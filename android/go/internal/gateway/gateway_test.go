package gateway

import (
 "bufio"
 "context"
 "crypto/sha1"
 "encoding/base64"
 "fmt"
 "io"
 "net"
 "net/http"
 "net/http/httptest"
 "net/url"
 "strings"
 "sync/atomic"
 "testing"
 "time"
)
func TestParseTarget(t *testing.T) {
 for _, raw := range []string{"100.64.0.1", "http://100.100.0.1:4319", "machine.tail123.ts.net", "https://machine.tail123.ts.net", "http://[fd7a:115c:a1e0::1]:4319"} { if _,e:=ParseTarget(raw); e!=nil {t.Errorf("%s: %v",raw,e)} }
 for _, raw := range []string{"127.0.0.1", "localhost", "https://example.com", "http://user:pass@100.64.0.1", "http://100.64.0.1/a", "http://100.64.0.1?x=1", "http://100.64.0.1#secret", "http://100.64.0.1:0", "http://100.64.0.1:99999", "ftp://100.64.0.1", "evil.ts.net.example.com", "-a.ts.net", "a..ts.net"} {if _,e:=ParseTarget(raw);e==nil {t.Errorf("accepted %s",raw)} }
 u,_:=ParseTarget("100.64.0.1"); if u.Host!="100.64.0.1:4319" {t.Fatal(u)}
 u,_=ParseTarget("https://m.tail.ts.net"); if u.Host!="m.tail.ts.net:443" {t.Fatal(u)}
}
func fixture(t *testing.T,h http.HandlerFunc)(*Gateway,*atomic.Int32) {
 t.Helper(); upstream:=httptest.NewServer(h); t.Cleanup(upstream.Close)
 actual,_:=url.Parse(upstream.URL); target,_:=ParseTarget("100.64.0.1:4319"); count:=&atomic.Int32{}
 g,e:=New(target,func(ctx context.Context,network,address string)(net.Conn,error){ count.Add(1); if address!=target.Host {return nil,fmt.Errorf("wrong target %s",address)}; return (&net.Dialer{}).DialContext(ctx,network,actual.Host) }); if e!=nil{t.Fatal(e)}; t.Cleanup(g.Close); return g,count
}
func TestUnauthorizedNeverDials(t *testing.T) {
 g,count:=fixture(t,func(w http.ResponseWriter,r *http.Request){w.WriteHeader(200)})
 cases:=[]struct{cookie,origin,method,upgrade,host string}{
  {"","","GET","",""},{"axiom_local_session=wrong","","GET","",""},
  {CookieName+"="+g.token+"; "+CookieName+"="+g.token,"","GET","",""},
  {CookieName+"="+g.token,"http://evil.test","GET","",""},
  {CookieName+"="+g.token,"","POST","",""},
  {CookieName+"="+g.token,"","GET","websocket",""},
  {CookieName+"="+g.token,g.origin,"CONNECT","",""},
  {CookieName+"="+g.token,g.origin,"GET","","localhost:123"},
 }
 for _,c:=range cases{req,_:=http.NewRequest(c.method,g.URL()+"/",nil); req.Header.Set("Cookie",c.cookie); req.Header.Set("Origin",c.origin);req.Header.Set("Upgrade",c.upgrade);if c.host!=""{req.Host=c.host};resp,e:=http.DefaultClient.Do(req);if e!=nil{t.Fatal(e)};resp.Body.Close();if resp.StatusCode!=403{t.Errorf("got %d",resp.StatusCode)}}
 g.mu.Lock();g.expires=time.Now().Add(-time.Second);g.mu.Unlock()
 req,_:=http.NewRequest("GET",g.URL(),nil);req.AddCookie(&http.Cookie{Name:CookieName,Value:g.token});resp,e:=http.DefaultClient.Do(req);if e!=nil{t.Fatal(e)};resp.Body.Close();if resp.StatusCode!=403{t.Fatal(resp.StatusCode)}
 if count.Load()!=0{t.Fatalf("unauthorized dial count %d",count.Load())}
}
func TestHTTPIdentityAndPolicy(t *testing.T){
 g,_:=fixture(t,func(w http.ResponseWriter,r *http.Request){
  if r.Host!="100.64.0.1:4319"||r.Header.Get("Origin")!="http://100.64.0.1:4319"{t.Error("upstream origin/host mismatch")}
  if r.Header.Get("Cookie")!=""||r.Header.Get("Authorization")!=""||r.Header.Get("X-Forwarded-For")!=""{t.Error("credential/header leaked")}
  b,_:=io.ReadAll(r.Body);if string(b)!="image payload"{t.Error("upload lost")}
  w.Header().Set("Set-Cookie","evil=x");w.Header().Set("Refresh","0;url=http://evil.test");w.Write([]byte("ok"))
 })
 req,_:=http.NewRequest("POST",g.URL()+"/upload",strings.NewReader("image payload"));req.AddCookie(&http.Cookie{Name:CookieName,Value:g.token});req.Header.Set("Origin",g.URL());req.Header.Set("Authorization","secret");req.Header.Set("X-Forwarded-For","evil")
 resp,e:=http.DefaultClient.Do(req);if e!=nil{t.Fatal(e)};defer resp.Body.Close();if resp.StatusCode!=200{t.Fatal(resp.StatusCode)}
 csp:=resp.Header.Get("Content-Security-Policy");for _,s:=range []string{g.URL(),"ws"+strings.TrimPrefix(g.URL(),"http"),"worker-src 'none'","form-action 'none'","frame-src 'none'"}{if !strings.Contains(csp,s){t.Error("CSP missing",s)}}
 if resp.Header.Get("Set-Cookie")!=""||resp.Header.Get("Refresh")!=""{t.Error("unsafe response header")}
}
func TestRedirectRestricted(t *testing.T){
 for _,loc:=range []string{"/next","http://100.64.0.1:4319/next","http://127.0.0.1:9876/steal","//evil.test/"}{t.Run(loc,func(t *testing.T){
  g,_:=fixture(t,func(w http.ResponseWriter,r *http.Request){w.Header().Set("Location",loc);w.WriteHeader(302)})
  req,_:=http.NewRequest("GET",g.URL(),nil);req.AddCookie(&http.Cookie{Name:CookieName,Value:g.token});c:=&http.Client{CheckRedirect:func(*http.Request,[]*http.Request)error{return http.ErrUseLastResponse}}
  resp,e:=c.Do(req);if e!=nil{t.Fatal(e)};defer resp.Body.Close()
  if strings.Contains(loc,"evil")||strings.Contains(loc,"steal"){if resp.StatusCode!=502{t.Fatal(resp.StatusCode)}}else if resp.Header.Get("Location")!=g.URL()+"/next"{t.Fatal(resp.Header.Get("Location"))}
 })}
}
func TestWebSocketUpgradeAndClose(t *testing.T){
 g,_:=fixture(t,func(w http.ResponseWriter,r *http.Request){
  if r.Header.Get("Sec-WebSocket-Protocol")!="axiom"||r.Header.Get("Origin")!="http://100.64.0.1:4319"||r.Header.Get("Cookie")!=""{t.Error("WS identity headers")}
  c,b,e:=w.(http.Hijacker).Hijack();if e!=nil{t.Error(e);return};defer c.Close()
  key:=r.Header.Get("Sec-WebSocket-Key");sum:=sha1.Sum([]byte(key+"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
  fmt.Fprintf(b,"HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Protocol: axiom\r\nSec-WebSocket-Accept: %s\r\n\r\n",base64.StdEncoding.EncodeToString(sum[:]));b.Flush()
  // One masked binary client frame, one unmasked server frame (RFC 6455).
  frame:=make([]byte,10);if _,e:=io.ReadFull(b,frame);e!=nil{return};if frame[0]!=0x82||frame[1]!=0x84{t.Error("invalid client frame");return};for i:=0;i<4;i++{frame[6+i]^=frame[2+i]};c.Write(append([]byte{0x82,4},frame[6:]...));io.Copy(c,c)
 })
 u,_:=url.Parse(g.URL());c,e:=net.Dial("tcp",u.Host);if e!=nil{t.Fatal(e)};defer c.Close();c.SetDeadline(time.Now().Add(5*time.Second))
 fmt.Fprintf(c,"GET /ws HTTP/1.1\r\nHost: %s\r\nOrigin: %s\r\nCookie: %s=%s\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Protocol: axiom\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",u.Host,g.URL(),CookieName,g.token)
 br:=bufio.NewReader(c);resp,e:=http.ReadResponse(br,&http.Request{Method:"GET"});if e!=nil{t.Fatal(e)};if resp.StatusCode!=101{t.Fatal(resp.StatusCode)}
 if resp.Header.Get("Sec-WebSocket-Accept")!="s3pPLMBiTxaQ9kYGzzhZRbK+xOo="{t.Fatal("invalid WS accept")}
 c.Write([]byte{0x82,0x84,1,2,3,4,'e'^1,'c'^2,'h'^3,'o'^4});b:=make([]byte,6);if _,e=io.ReadFull(br,b);e!=nil||b[0]!=0x82||string(b[2:])!="echo"{t.Fatal(b,e)}
 g.Close();if _,e=br.ReadByte();e==nil{t.Fatal("upgraded connection survived close")}
}
