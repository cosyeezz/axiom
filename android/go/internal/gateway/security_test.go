package gateway

import (
 "bufio"
 "context"
 "fmt"
 "net"
 "net/http"
 "net/http/httptest"
 "net/url"
 "strings"
 "testing"
 "time"
)

func TestAbsoluteRequestRejected(t *testing.T){
 g,dials:=fixture(t,func(w http.ResponseWriter,r *http.Request){t.Error("unexpected upstream request")})
 u,_:=url.Parse(g.URL());c,e:=net.Dial("tcp",u.Host);if e!=nil{t.Fatal(e)};defer c.Close();c.SetDeadline(time.Now().Add(time.Second*3))
 fmt.Fprintf(c,"GET http://%s/ HTTP/1.1\r\nHost: %s\r\nCookie: %s=%s\r\n\r\n",u.Host,u.Host,CookieName,g.token)
 resp,e:=http.ReadResponse(bufio.NewReader(c),&http.Request{Method:"GET"});if e!=nil{t.Fatal(e)};defer resp.Body.Close();if resp.StatusCode!=403||dials.Load()!=0{t.Fatal(resp.StatusCode,dials.Load())}
}
func TestTargetIsCopied(t *testing.T){
 actual:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){if r.Host!="100.64.0.1:4319"{t.Error("target mutation changed host")};w.WriteHeader(200)}));defer actual.Close()
 upstream,_:=url.Parse(actual.URL);target,_:=ParseTarget("100.64.0.1:4319")
 g,e:=New(target,func(ctx context.Context,network,address string)(net.Conn,error){if address!="100.64.0.1:4319"{t.Error("target mutation changed dial")};return (&net.Dialer{}).DialContext(ctx,network,upstream.Host)});if e!=nil{t.Fatal(e)};defer g.Close()
 target.Host="100.64.0.2:8080"
 if e=g.Probe();e!=nil{t.Fatal(e)}
}
func TestCrossSiteAndMultipleOriginsRejected(t *testing.T){
 g,dials:=fixture(t,func(w http.ResponseWriter,r *http.Request){t.Error("unexpected request")})
 for _,multiple:=range []bool{false,true}{req,_:=http.NewRequest("GET",g.URL(),nil);req.AddCookie(&http.Cookie{Name:CookieName,Value:g.token});if multiple{req.Header.Add("Origin",g.URL());req.Header.Add("Origin",g.URL())}else{req.Header.Set("Sec-Fetch-Site","cross-site")};resp,e:=http.DefaultClient.Do(req);if e!=nil{t.Fatal(e)};resp.Body.Close();if resp.StatusCode!=403{t.Fatal(resp.StatusCode)}}
 if dials.Load()!=0{t.Fatal("unauthorized upstream dial")}
}
func TestRenewAndClosedGateway(t *testing.T){
 g,_:=fixture(t,func(w http.ResponseWriter,r *http.Request){w.WriteHeader(200)})
 g.mu.Lock();g.expires=time.Now().Add(-time.Second);g.mu.Unlock();g.Renew();if e:=g.Probe();e!=nil{t.Fatal(e)}
 g.Close();g.Renew();req,_:=http.NewRequest("GET",g.URL(),nil);req.AddCookie(&http.Cookie{Name:CookieName,Value:g.token});rec:=httptest.NewRecorder();g.authenticate(http.HandlerFunc(func(http.ResponseWriter,*http.Request){t.Error("closed handler accepted")})).ServeHTTP(rec,req);if rec.Code!=403{t.Fatal(rec.Code)}
}
func TestPolicyDoesNotUseWildcardLoopback(t *testing.T){
 g,_:=fixture(t,func(w http.ResponseWriter,r *http.Request){w.Write([]byte("<html></html>"))})
 req,_:=http.NewRequest("GET",g.URL(),nil);req.AddCookie(&http.Cookie{Name:CookieName,Value:g.token});resp,e:=http.DefaultClient.Do(req);if e!=nil{t.Fatal(e)};defer resp.Body.Close();csp:=resp.Header.Get("Content-Security-Policy")
 if strings.Contains(csp,"*")||strings.Contains(csp,"http:")&&!strings.Contains(csp,g.URL()){t.Fatal(csp)}
}
