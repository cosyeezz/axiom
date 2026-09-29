// Package bridge is the deliberately small gomobile API. It exports no node
// keys, arbitrary dial method, auth keys, or system VPN controls.
package bridge

import (
 "context"
 "encoding/json"
 "errors"
 "os"
 "path/filepath"
 "sync"
 "time"

 "github.com/cosyeezz/axiom/android/internal/gateway"
 "tailscale.com/client/local"
 "tailscale.com/ipn"
 "tailscale.com/tsnet"
)

var state struct {
 sync.Mutex
 server *tsnet.Server
 client *local.Client
 gateway *gateway.Gateway
 dir string
 target string
}

// Start validates before initializing the native node. State must be stored in
// Android's noBackupFilesDir, never external storage or a shared cache.
func Start(directory, target string) error {
 u,err:=gateway.ParseTarget(target);if err!=nil{return err}
 if !filepath.IsAbs(directory){return errors.New("节点状态需要应用私有绝对路径")}
 state.Lock();defer state.Unlock()
 if state.server!=nil&&state.dir!=directory{return errors.New("节点已在另一个目录启动")}
 if state.server==nil{
  if err=os.MkdirAll(directory,0700);err!=nil{return errors.New("无法创建私有节点目录")}
  _=os.Chmod(directory,0700)
  // LocalBackend's sockstat logger resolves LogsDir independently of Server.Dir.
  // Android has no usable default HOME/cwd/tmp for that lookup.
  if err=os.Setenv("TS_LOGS_DIR",directory);err!=nil{return errors.New("无法设置私有日志目录")}
  quiet:=func(string,...any){}
  s:=&tsnet.Server{Dir:directory,Hostname:"axiom-android",Ephemeral:false,Logf:quiet,UserLogf:quiet}
  if err=s.Start();err!=nil{return errors.New("Tailscale 网络启动失败："+err.Error())}
  lc,e:=s.LocalClient();if e!=nil{_=s.Close();return errors.New("无法访问应用内网络状态")}
  state.server=s;state.client=lc;state.dir=directory
 }
 ctx,cancel:=context.WithTimeout(context.Background(),10*time.Second);defer cancel()
 _,err=state.client.EditPrefs(ctx,&ipn.MaskedPrefs{Prefs:ipn.Prefs{WantRunning:true},WantRunningSet:true})
 if err!=nil{return errors.New("无法恢复 Tailscale 连接")}
 if state.gateway!=nil{state.gateway.Close();state.gateway=nil}
 g,err:=gateway.New(u,state.server.Dial);if err!=nil{return errors.New("无法建立本地安全入口")}
 state.gateway=g;state.target=u.String()
 return nil
}

// Status returns user-facing state, not raw LocalAPI output (which can contain
// private node details). AuthURL is delivered only to native login handling.
func Status() string {
 state.Lock();defer state.Unlock()
 result:=map[string]any{"running":false,"needsLogin":false,"message":"填写电脑地址后点击连接。"}
 if state.client!=nil{
  ctx,cancel:=context.WithTimeout(context.Background(),5*time.Second);defer cancel()
  st,err:=state.client.Status(ctx)
  if err!=nil{result["message"]="无法读取应用内网络状态，请重试。"}else{
   result["state"]=st.BackendState;result["authUrl"]=st.AuthURL
   switch st.BackendState{
   case "Running":result["running"]=true;result["message"]="私网已连接，正在准备工作台。"
   case "NeedsLogin":result["needsLogin"]=true;result["message"]="请登录 Tailscale。首次授权完成后回到此应用。"
   case "NeedsMachineAuth":result["message"]="设备等待批准，请在 Tailscale 管理后台授权此设备。"
   case "Stopped":result["message"]="应用内网络已停止，请点击连接恢复。"
   default:result["message"]="正在连接 Tailscale，请稍候…";result["needsLogin"]=st.AuthURL!=""
   }
  }
 }
 b,_:=json.Marshal(result);return string(b)
}
func Login() error {
 state.Lock();defer state.Unlock();if state.client==nil{return errors.New("请先填写地址并点击连接")}
 ctx,cancel:=context.WithTimeout(context.Background(),10*time.Second);defer cancel()
 if err:=state.client.StartLoginInteractive(ctx);err!=nil{return errors.New("无法开始登录，请检查手机网络后重试")};return nil
}
func LocalURL() string {state.Lock();defer state.Unlock();if state.gateway==nil{return ""};return state.gateway.URL()}
func SessionToken() string {state.Lock();defer state.Unlock();if state.gateway==nil{return ""};return state.gateway.Token()}
func Probe() error {state.Lock();defer state.Unlock();if state.gateway==nil{return errors.New("本地连接尚未建立")};return state.gateway.Probe()}
func Renew(){state.Lock();defer state.Unlock();if state.gateway!=nil{state.gateway.Renew()}}
// Disconnect revokes local browser access. Keep the node until process exit so
// Activity recreation doesn't race asynchronous tsnet initialization/Close.
func Disconnect(){state.Lock();defer state.Unlock();if state.gateway!=nil{state.gateway.Close();state.gateway=nil};state.target=""}
func Reset(directory string) error {
 if !filepath.IsAbs(directory)||filepath.Base(directory)!="tailscale"{return errors.New("拒绝清理非节点私有目录")}
 state.Lock();defer state.Unlock()
 if state.dir!=""&&state.dir!=directory{return errors.New("节点目录不一致")}
 if state.gateway!=nil{state.gateway.Close();state.gateway=nil}
 if state.server!=nil{if err:=state.server.Close();err!=nil{return errors.New("关闭应用内网络失败，请重启应用后重试")};state.server=nil;state.client=nil}
 if err:=os.RemoveAll(directory);err!=nil{return errors.New("删除本机节点状态失败")}
 state.dir="";state.target="";return nil
}
