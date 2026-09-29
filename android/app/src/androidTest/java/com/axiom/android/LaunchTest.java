package com.axiom.android;

import android.app.Instrumentation;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import android.net.Uri;
import androidx.test.platform.app.InstrumentationRegistry;
import bridge.Bridge;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;
import java.io.File;
import static org.junit.Assert.*;

public final class LaunchTest {
    private Instrumentation instrumentation;
    private MainActivity activity;
    @Before public void launch(){
        instrumentation=InstrumentationRegistry.getInstrumentation();
        Intent intent=new Intent(instrumentation.getTargetContext(),MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity=(MainActivity)instrumentation.startActivitySync(intent);
        instrumentation.waitForIdleSync();
    }
    @After public void finish(){instrumentation.runOnMainSync(()->activity.finish());instrumentation.waitForIdleSync();}
    @Test public void nativeConnectionScreen(){
        instrumentation.runOnMainSync(()->{
            View root=activity.findViewById(android.R.id.content);
            assertTrue("address input missing",count(root,EditText.class)>=1);
            assertTrue("connection actions missing",count(root,Button.class)>=3);
            assertEquals("must not load a page before authentication",0,count(root,WebView.class));
        });
    }
    @Test public void nativeBridgeRejectsPublicAndLoopbackTargets(){
        for(String target:new String[]{"127.0.0.1:4319","https://example.com","http://u:p@100.64.0.1"}){
            boolean rejected=false;
            try { Bridge.start(activity.getNoBackupFilesDir().getAbsolutePath()+"/test-state",target); }
            catch(Exception expected){rejected=true;}
            assertTrue("unsafe destination accepted",rejected);
        }
    }
    @Test public void unauthenticatedNodeReachesOfficialLogin() throws Exception {
        String dir=new File(activity.getNoBackupFilesDir(),"tailscale").getAbsolutePath();
        try {
            Bridge.start(dir,"100.64.0.1:4319");
            long deadline=System.currentTimeMillis()+90000;
            while(System.currentTimeMillis()<deadline){
                JSONObject state=new JSONObject(Bridge.status());
                String value=state.optString("authUrl");
                if(!value.isEmpty()){
                    Uri uri=Uri.parse(value);
                    assertEquals("https",uri.getScheme());
                    assertTrue("unexpected login provider", "login.tailscale.com".equals(uri.getHost())||"controlplane.tailscale.com".equals(uri.getHost()));
                    return; // Do not print/store the one-time authorization URL.
                }
                Thread.sleep(1000);
            }
            fail("Node could not obtain official login URL within 90 seconds (DNS/TLS/interface startup)");
        } finally { Bridge.reset(dir); }
    }
    private int count(View v,Class<?> type){int n=type.isInstance(v)?1:0;if(v instanceof ViewGroup){ViewGroup g=(ViewGroup)v;for(int i=0;i<g.getChildCount();i++)n+=count(g.getChildAt(i),type);}return n;}
}
