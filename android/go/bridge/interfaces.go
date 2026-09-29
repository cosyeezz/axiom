package bridge

import (
 "encoding/json"
 "errors"
 "net"
 "net/netip"
 "sync"

 "tailscale.com/net/netmon"
)

// InterfaceSource is implemented in Java: Android blocks Go's net.Interfaces
// on recent SDKs. The platform API remains available without a system VPN.
type InterfaceSource interface { Snapshot() (string,error) }
var interfaceOnce sync.Once

func InstallInterfaceSource(source InterfaceSource) {
 interfaceOnce.Do(func(){netmon.RegisterInterfaceGetter(func()([]netmon.Interface,error){
  raw,err:=source.Snapshot();if err!=nil{return nil,err};return parseInterfaces(raw)
 })})
}
func parseInterfaces(raw string)([]netmon.Interface,error){
 var rows []struct{Index int `json:"index"`;Name string `json:"name"`;MTU int `json:"mtu"`;Up bool `json:"up"`;Loopback bool `json:"loopback"`;Addrs []string `json:"addrs"`}
 if err:=json.Unmarshal([]byte(raw),&rows);err!=nil{return nil,err}
 result:=make([]netmon.Interface,0,len(rows))
 for _,r:=range rows{
  if r.Index<=0||r.Name==""{return nil,errors.New("invalid platform interface")}
  var flags net.Flags;if r.Up{flags|=net.FlagUp|net.FlagRunning};if r.Loopback{flags|=net.FlagLoopback}
  addrs:=make([]net.Addr,0,len(r.Addrs)) // must be non-nil to disable Go fallback
  for _,value:=range r.Addrs{p,err:=netip.ParsePrefix(value);if err!=nil{return nil,err};ip:=p.Addr();addrs=append(addrs,&net.IPNet{IP:net.IP(ip.AsSlice()),Mask:net.CIDRMask(p.Bits(),ip.BitLen())})}
  result=append(result,netmon.Interface{Interface:&net.Interface{Index:r.Index,Name:r.Name,MTU:r.MTU,Flags:flags},AltAddrs:addrs})
 }
 return result,nil
}
