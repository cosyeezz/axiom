package bridge

import (
 "encoding/json"
 "testing"
)
func TestRejectsTargetsBeforeStartingNode(t *testing.T){
 for _,target:=range []string{"127.0.0.1:4319","https://example.com","http://u:p@100.64.0.1"}{if err:=Start(t.TempDir(),target);err==nil{t.Fatal("invalid target accepted")}}
 if err:=Start("relative","100.64.0.1");err==nil{t.Fatal("relative state path accepted")}
 state.Lock();defer state.Unlock();if state.server!=nil||state.gateway!=nil{t.Fatal("invalid input started node")}
}
func TestIdleAPI(t *testing.T){
 var s map[string]any;if err:=json.Unmarshal([]byte(Status()),&s);err!=nil{t.Fatal(err)}
 if s["running"]!=false||s["needsLogin"]!=false{t.Fatal(s)}
 if LocalURL()!=""||SessionToken()!=""{t.Fatal("idle credentials exposed")}
 if Probe()==nil||Login()==nil{t.Fatal("idle operations succeeded")}
 Renew();Disconnect();if err:=Reset();err!=nil{t.Fatal(err)}
}
