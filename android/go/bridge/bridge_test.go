package bridge

import (
 "encoding/json"
 "os"
 "path/filepath"
 "testing"
)
func TestRejectsTargetsBeforeStartingNode(t *testing.T){
 for _,target:=range []string{"127.0.0.1:4319","https://example.com","http://u:p@100.64.0.1"}{if err:=Start(t.TempDir(),target);err==nil{t.Fatal("invalid target accepted")}}
 if err:=Start("relative","100.64.0.1");err==nil{t.Fatal("relative state path accepted")}
 state.Lock();defer state.Unlock();if state.server!=nil||state.gateway!=nil{t.Fatal("invalid input started node")}
}
func TestResetWithoutSuccessfulStart(t *testing.T){
 dir:=filepath.Join(t.TempDir(),"tailscale");if err:=os.MkdirAll(dir,0700);err!=nil{t.Fatal(err)};if err:=os.WriteFile(filepath.Join(dir,"node-state"),[]byte("test-secret"),0600);err!=nil{t.Fatal(err)}
 if err:=Reset(dir);err!=nil{t.Fatal(err)};if _,err:=os.Stat(dir);!os.IsNotExist(err){t.Fatal("state remained after reset")}
 if Reset(t.TempDir())==nil{t.Fatal("non-node directory accepted")}
}
func TestInterfaceSnapshot(t *testing.T){
 rows,err:=parseInterfaces(`[{"index":1,"name":"lo","mtu":65536,"up":true,"loopback":true,"addrs":[]},{"index":2,"name":"wlan0","mtu":1500,"up":true,"addrs":["192.168.1.4/24","fd00::1/64"]}]`);if err!=nil{t.Fatal(err)};if rows[0].AltAddrs==nil{t.Fatal("Go fallback enabled")};if rows[1].AltAddrs[0].String()!="192.168.1.4/24"{t.Fatal(rows[1])}
}
func TestIdleAPI(t *testing.T){
 var s map[string]any;if err:=json.Unmarshal([]byte(Status()),&s);err!=nil{t.Fatal(err)}
 if s["running"]!=false||s["needsLogin"]!=false{t.Fatal(s)}
 if LocalURL()!=""||SessionToken()!=""{t.Fatal("idle credentials exposed")}
 if Probe()==nil||Login()==nil{t.Fatal("idle operations succeeded")}
 Renew();Disconnect();if err:=Reset(filepath.Join(t.TempDir(),"tailscale"));err!=nil{t.Fatal(err)}
}
