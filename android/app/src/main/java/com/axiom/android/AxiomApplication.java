package com.axiom.android;

import android.app.Application;
import bridge.Bridge;
import bridge.InterfaceSource;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.util.Enumeration;
import org.json.JSONArray;
import org.json.JSONObject;

public final class AxiomApplication extends Application {
    @Override public void onCreate(){
        super.onCreate();
        go.Seq.setContext(getApplicationContext());
        // Install once for the process, before any Activity can start tsnet.
        Bridge.installInterfaceSource(new AndroidInterfaces());
    }
    private static final class AndroidInterfaces implements InterfaceSource {
        @Override public String snapshot() throws Exception {
            JSONArray rows=new JSONArray();
            Enumeration<NetworkInterface> interfaces=NetworkInterface.getNetworkInterfaces();
            while(interfaces!=null&&interfaces.hasMoreElements()){
                NetworkInterface ni=interfaces.nextElement();
                JSONObject row=new JSONObject();row.put("index",ni.getIndex());row.put("name",ni.getName());row.put("mtu",ni.getMTU());row.put("up",ni.isUp());row.put("loopback",ni.isLoopback());
                JSONArray addrs=new JSONArray();
                for(InterfaceAddress ia:ni.getInterfaceAddresses()){
                    InetAddress address=ia.getAddress();if(address==null)continue;
                    String ip=address.getHostAddress();if(ip==null)continue;int zone=ip.indexOf('%');if(zone>=0)ip=ip.substring(0,zone);
                    int prefix=ia.getNetworkPrefixLength();int bits=address.getAddress().length*8;
                    if(prefix<0||prefix>bits)throw new IllegalStateException("Invalid interface prefix");
                    addrs.put(ip+"/"+prefix);
                }
                row.put("addrs",addrs);rows.put(row);
            }
            return rows.toString();
        }
    }
}
