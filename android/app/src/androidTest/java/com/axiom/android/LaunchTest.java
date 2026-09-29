package com.axiom.android;

import android.test.ActivityInstrumentationTestCase2;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import bridge.Bridge;
import org.json.JSONObject;
import android.net.Uri;
import java.io.File;

@SuppressWarnings("deprecation")
public final class LaunchTest extends ActivityInstrumentationTestCase2<MainActivity> {
    public LaunchTest() { super(MainActivity.class); }
    public void testNativeConnectionScreen() throws Throwable {
        MainActivity a=getActivity();
        getInstrumentation().waitForIdleSync();
        View root=a.findViewById(android.R.id.content);
        assertTrue("address input missing",count(root,EditText.class)>=1);
        assertTrue("connection actions missing",count(root,Button.class)>=3);
        assertEquals("must not load a page before authentication",0,count(root,WebView.class));
    }
    public void testNativeBridgeRejectsPublicAndLoopbackTargets() throws Throwable {
        getActivity();
        for(String target:new String[]{"127.0.0.1:4319","https://example.com","http://u:p@100.64.0.1"}){
            boolean rejected=false;
            try { Bridge.start(getActivity().getNoBackupFilesDir().getAbsolutePath()+"/test-state",target); }
            catch(Exception expected){rejected=true;}
            assertTrue("unsafe destination accepted",rejected);
        }
    }
    public void testUnauthenticatedNodeReachesOfficialLogin() throws Exception {
        MainActivity a=getActivity();
        String dir=new File(a.getNoBackupFilesDir(),"tailscale").getAbsolutePath();
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
