package com.axiom.android;

import android.app.AlertDialog;
import android.app.Instrumentation;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.LinearLayout;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.Before;
import org.junit.After;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Local HTML only: exercises real WebView clicks and native lifecycle, not tailnet login. */
public final class ConnectionUiTest {
    private final Instrumentation inst=InstrumentationRegistry.getInstrumentation();
    private String ORIGIN;
    private ConnectionRecoveryTest.Server server;
    private static final String PATH="/_axiom/native/connection";
    private final String html="<meta name='viewport' content='width=device-width,initial-scale=1'><a style='display:block;height:60px' href='"+PATH+"'>Connection</a><textarea id='draft'>unchanged draft</textarea><div style='height:2400px'>Reading</div><script>window.sentinel='original';</script>";
    @Before public void startServer() throws Exception {server=new ConnectionRecoveryTest.Server(html);ORIGIN=server.origin();}
    @After public void stopServer() throws Exception {if(server!=null)server.close();}
    private ActivityScenario<MainActivity> launch(){
        inst.getTargetContext().getSharedPreferences("connection",Context.MODE_PRIVATE).edit().clear().commit();
        ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(a->{
            set(a,"foreground",false);((Handler)get(a,"handler")).removeCallbacks((Runnable)get(a,"poll"));
            call(a,"buildWebView",new Class<?>[]{String.class,String.class},ORIGIN,"test-local-cookie");
        });
        return scenario;
    }
    @Test public void nativePolicyConsumesInvalidActions() throws Exception {
        try(ActivityScenario<MainActivity> s=launch()){
            waitReady(s);
            s.onActivity(a->{
                WebView web=(WebView)get(a,"web");
                for(Request r:new Request[]{new Request(ORIGIN+PATH,false,true,false,"GET"),new Request(ORIGIN+PATH,true,false,false,"GET"),new Request(ORIGIN+PATH,true,true,true,"GET"),new Request(ORIGIN+PATH,true,true,false,"POST"),new Request(ORIGIN+PATH+"?x=1"),new Request(ORIGIN+PATH+"#x"),new Request(ORIGIN+"/_axiom/native/unknown"),new Request("http://127.0.0.1:1"+PATH),new Request(ORIGIN+"/_axiom/native/%63onnection")}){
                    assertFalse((Boolean)call(a,"allowConnectionIntent",new Class<?>[]{WebView.class,WebResourceRequest.class},web,r));
                    assertTrue(web.getWebViewClient().shouldOverrideUrlLoading(web,r));
                    assertNull(get(a,"connectionPanel"));
                }
                assertTrue(web.getWebViewClient().shouldOverrideUrlLoading(web,new Request(ORIGIN+PATH)));
                assertNotNull(get(a,"connectionPanel"));
                call(a,"closeConnectionPanel");
            });
        }
    }
    @Test public void realTapAndBackPreservePageAndNoPersistentToolbar() throws Exception {
        try(ActivityScenario<MainActivity> s=launch()){
            waitReady(s);
            js(s,"document.getElementById('draft').value='dynamic draft'; window.sentinel='dynamic-'+Math.random();");
            String content=js(s,"document.getElementById('draft').value+'|'+sentinel");
            AtomicReference<WebView> saved=new AtomicReference<>();int[] xy=new int[2];
            s.onActivity(a->{
                WebView web=(WebView)get(a,"web");saved.set(web);
                LinearLayout root=(LinearLayout)get(a,"root");
                assertEquals(View.GONE,((View)get(a,"recovery")).getVisibility());
                assertEquals(root.getPaddingTop(),web.getTop());
                assertTrue(web.getHeight()>root.getHeight()-root.getPaddingTop()-root.getPaddingBottom()-2);
                web.getLocationOnScreen(xy);xy[0]+=40;xy[1]+=40;
            });
            long now=SystemClock.uptimeMillis();
            MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,xy[0],xy[1],0);
            MotionEvent up=MotionEvent.obtain(now,now+60,MotionEvent.ACTION_UP,xy[0],xy[1],0);
            inst.sendPointerSync(down);inst.sendPointerSync(up);down.recycle();up.recycle();inst.waitForIdleSync();
            s.onActivity(a->{assertNotNull("real user gesture opens native settings",get(a,"connectionPanel"));assertSame(saved.get(),get(a,"web"));});
            inst.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);inst.waitForIdleSync();
            s.onActivity(a->{assertNull(get(a,"connectionPanel"));assertSame(saved.get(),get(a,"web"));});
            assertEquals(content,js(s,"document.getElementById('draft').value+'|'+sentinel"));
            js(s,"window.scrollTo(0,500)");
            String scroll=waitScrolled(s);
            inst.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);inst.waitForIdleSync();
            s.onActivity(a->{assertNotNull("back fallback opens settings",get(a,"connectionPanel"));call(a,"closeConnectionPanel");assertSame(saved.get(),get(a,"web"));});
            assertEquals(scroll,js(s,"window.scrollY"));
            assertEquals(content,js(s,"document.getElementById('draft').value+'|'+sentinel"));
        }
    }
    @Test public void cancellingDestructiveActionsPreservesPage() throws Exception {
        try(ActivityScenario<MainActivity> s=launch()){
            waitReady(s);
            js(s,"document.getElementById('draft').value='dynamic draft'; window.sentinel=Math.random(); window.scrollTo(0,500);");
            String scroll=waitScrolled(s), content=js(s,"document.getElementById('draft').value+'|'+sentinel");
            AtomicReference<WebView> saved=new AtomicReference<>();int[] generation=new int[1];
            s.onActivity(a->{saved.set((WebView)get(a,"web"));generation[0]=(Integer)get(a,"generation");});
            for(String action:new String[]{"panelReload","panelSwitch","panelClear"}){
                s.onActivity(a->{call(a,"showConnectionPanel");((View)get(a,action)).performClick();});
                inst.waitForIdleSync();inst.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);inst.waitForIdleSync();
                s.onActivity(a->{assertNotNull(get(a,"connectionPanel"));assertSame(saved.get(),get(a,"web"));assertEquals(generation[0],get(a,"generation"));assertEquals(ORIGIN,get(a,"localOrigin"));call(a,"closeConnectionPanel");});
                assertEquals(content,js(s,"document.getElementById('draft').value+'|'+sentinel"));
                assertEquals(scroll,js(s,"window.scrollY"));
            }
        }
    }
    @Test public void loginRecoveryIsConditionalAndDoesNotDestroyPage() throws Exception {
        try(ActivityScenario<MainActivity> s=launch()){
            waitReady(s);
            JSONObject login=new JSONObject().put("needsLogin",true).put("message","Login required");
            JSONObject ready=new JSONObject().put("needsLogin",false).put("running",true).put("message","Running");
            s.onActivity(a->{
                WebView web=(WebView)get(a,"web");
                call(a,"renderStatus",new Class<?>[]{JSONObject.class},login);
                assertEquals(View.VISIBLE,((View)get(a,"recovery")).getVisibility());
                ((View)get(a,"recovery")).performClick();AlertDialog panel=(AlertDialog)get(a,"connectionPanel");
                call(a,"renderStatus",new Class<?>[]{JSONObject.class},login);assertSame(panel,get(a,"connectionPanel"));
                assertEquals(View.VISIBLE,((View)get(a,"panelLogin")).getVisibility());
                call(a,"renderStatus",new Class<?>[]{JSONObject.class},ready);
                assertEquals(View.GONE,((View)get(a,"recovery")).getVisibility());assertSame(web,get(a,"web"));
                call(a,"closeConnectionPanel");
            });
        }
    }
    private String waitScrolled(ActivityScenario<MainActivity> s) throws Exception {
        for(int i=0;i<30;i++){String value=js(s,"window.scrollY");if(Double.parseDouble(value)>0)return value;Thread.sleep(100);}
        throw new AssertionError("fixture did not scroll");
    }
    private void waitReady(ActivityScenario<MainActivity> s) throws Exception {
        for(int i=0;i<50;i++){
            AtomicReference<Boolean> ready=new AtomicReference<>(false);
            s.onActivity(a->ready.set((Boolean)get(a,"documentReady")));
            if(ready.get()&&"true".equals(js(s,"!!document.getElementById('draft')")))return;
            Thread.sleep(100);
        }
        fail("fixture did not load");
    }
    private String js(ActivityScenario<MainActivity> s,String code) throws Exception {
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
        s.onActivity(a->((WebView)get(a,"web")).evaluateJavascript(code,v->{result.set(v);done.countDown();}));
        assertTrue(done.await(5,TimeUnit.SECONDS));return result.get();
    }
    private static Object get(MainActivity a,String n){try{Field f=MainActivity.class.getDeclaredField(n);f.setAccessible(true);return f.get(a);}catch(Exception e){throw new AssertionError(e);}}
    private static void set(MainActivity a,String n,Object v){try{Field f=MainActivity.class.getDeclaredField(n);f.setAccessible(true);f.set(a,v);}catch(Exception e){throw new AssertionError(e);}}
    private static Object call(MainActivity a,String n){return call(a,n,new Class<?>[0]);}
    private static Object call(MainActivity a,String n,Class<?>[] types,Object... args){try{Method m=MainActivity.class.getDeclaredMethod(n,types);m.setAccessible(true);return m.invoke(a,args);}catch(Exception e){throw new AssertionError(e);}}
    private static final class Request implements WebResourceRequest {
        final Uri url;final boolean main,gesture,redirect;final String method;
        Request(String url){this(url,true,true,false,"GET");}
        Request(String url,boolean main,boolean gesture,boolean redirect,String method){this.url=Uri.parse(url);this.main=main;this.gesture=gesture;this.redirect=redirect;this.method=method;}
        public Uri getUrl(){return url;}public boolean isForMainFrame(){return main;}public boolean hasGesture(){return gesture;}public boolean isRedirect(){return redirect;}public String getMethod(){return method;}public Map<String,String> getRequestHeaders(){return Collections.emptyMap();}
    }
}
