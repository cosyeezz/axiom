package com.axiom.android;

import android.app.Instrumentation;
import android.content.Context;
import android.os.Handler;
import android.webkit.CookieManager;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.lang.reflect.*;
import java.util.Collections;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;

/** Real loopback HTTP/WebView; no tailnet credentials and no external service. */
public final class ConnectionRecoveryTest {
    private final Instrumentation inst=InstrumentationRegistry.getInstrumentation();
    private ActivityScenario<MainActivity> launch(){
        inst.getTargetContext().getSharedPreferences("connection",Context.MODE_PRIVATE).edit().clear().commit();
        ActivityScenario<MainActivity> s=ActivityScenario.launch(MainActivity.class);
        s.onActivity(a->{set(a,"foreground",false);((Handler)get(a,"handler")).removeCallbacksAndMessages(null);});return s;
    }
    @Test public void asyncClearAndSetFinishBeforeFirstAuthenticatedNavigation() throws Exception {
        try(Server server=new Server();ActivityScenario<MainActivity> s=launch()){
            s.onActivity(a->{
                LocalCookies.set(server.origin(),"old",()->true,ignored->{});
                LocalCookies.clear();
                call(a,"buildWebView",new Class<?>[]{String.class,String.class},server.origin(),"new-token");
            });
            waitFor(()->server.requests.get()>0,"first navigation");
            assertTrue(server.cookie.get(),server.cookie.get().contains("axiom_local_session=new-token"));
            waitFor(()->bool(s,"documentReady"),"document commit");
            assertEquals("\"\"",js(s,"document.cookie")); // HttpOnly is not exposed.
            js(s,"document.getElementById('draft').value='keep draft';window.sentinel=Math.random()");
            String before=js(s,"draft.value+'|'+sentinel");int requests=server.requests.get();
            s.onActivity(a->{set(a,"lastRecoveryWake",-30000L);call(a,"wakeRecovery");});
            assertEquals(before,js(s,"draft.value+'|'+sentinel"));assertEquals(requests,server.requests.get());
        }
    }
    @Test public void supersededCookieWriteCannotNavigateOldWebView() throws Exception {
        try(Server server=new Server();ActivityScenario<MainActivity> s=launch()){
            AtomicReference<WebView> old=new AtomicReference<>();
            s.onActivity(a->{
                call(a,"buildWebView",new Class<?>[]{String.class,String.class},server.origin(),"old-token");
                old.set((WebView)get(a,"web"));WebViewClient client=old.get().getWebViewClient();
                call(a,"buildWebView",new Class<?>[]{String.class,String.class},server.origin(),"new-token");
                assertNotSame(old.get(),get(a,"web"));
                client.onPageCommitVisible(old.get(),server.origin()+"/");
                assertFalse((Boolean)get(a,"documentReady"));
            });
            waitFor(()->bool(s,"documentReady"),"new instance navigation");
            assertEquals(0,server.oldCookies.get());
            assertTrue(server.cookie.get(),server.cookie.get().contains("axiom_local_session=new-token"));
        }
    }
    @Test public void sameInstanceCallbackWithOldGenerationCannotCommit() throws Exception {
        try(Server server=new Server();ActivityScenario<MainActivity> s=launch()){
            s.onActivity(a->{
                call(a,"buildWebView",new Class<?>[]{String.class,String.class},server.origin(),"new-token");
                WebView web=(WebView)get(a,"web");WebViewClient client=web.getWebViewClient();
                set(a,"generation",(Integer)get(a,"generation")+1);
                client.onPageCommitVisible(web,server.origin()+"/");
                assertFalse((Boolean)get(a,"documentReady"));assertTrue((Boolean)get(a,"pageLoading"));
            });
        }
    }
    @Test public void establishedExplicitReloadUsesSameInstanceWithoutReenablingAutomaticReload() throws Exception {
        try(Server server=new Server();ActivityScenario<MainActivity> s=launch()){
            s.onActivity(a->call(a,"buildWebView",new Class<?>[]{String.class,String.class},server.origin(),"new-token"));
            waitFor(()->bool(s,"documentReady"),"initial commit");
            int before=server.requests.get();
            s.onActivity(a->{
                WebView old=(WebView)get(a,"web");call(a,"reloadWorkspace");assertSame(old,get(a,"web"));
                assertTrue((Boolean)get(a,"documentReady"));
            });
            waitFor(()->server.requests.get()>before,"explicit reload request");
            s.onActivity(a->{
                WebView web=(WebView)get(a,"web");
                web.getWebViewClient().onReceivedHttpError(web,new Request(server.origin()+"/",true),new WebResourceResponse("text/plain","UTF-8",502,"Bad Gateway",Collections.emptyMap(),new ByteArrayInputStream(new byte[0])));
                set(a,"lastRecoveryWake",-30000L);call(a,"wakeRecovery");
                assertEquals(0,get(a,"retryFailures"));assertReadyBlocksProbe(a);
            });
        }
    }
    @Test public void onlyExactInitialMainFrameGetCanFailRecovery() throws Exception {
        try(Server server=new Server();ActivityScenario<MainActivity> s=launch()){
            s.onActivity(a->{
                call(a,"buildWebView",new Class<?>[]{String.class,String.class},server.origin(),"new-token");
                WebView web=(WebView)get(a,"web");
                WebResourceResponse error=new WebResourceResponse("text/plain","UTF-8",502,"Bad Gateway",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
                for(Request r:new Request[]{new Request(server.origin()+"/",true,"POST"),new Request(server.origin()+"/",false),new Request(server.origin()+"/other",true)}){
                    web.getWebViewClient().onReceivedHttpError(web,r,error);assertEquals(0,get(a,"retryFailures"));assertTrue((Boolean)get(a,"pageLoading"));
                }
                web.getWebViewClient().onReceivedHttpError(web,new Request(server.origin()+"/",true),error);
                assertEquals(1,get(a,"retryFailures"));assertFalse((Boolean)get(a,"pageLoading"));
            });
        }
    }
    @Test public void transientFailureRetainsTargetButRetriesAreBoundedAndAuthStops() throws Exception {
        try(ActivityScenario<MainActivity> s=launch()){
            s.onActivity(a->{
                set(a,"foreground",true);set(a,"currentTarget","100.64.0.1:4319");
                for(int i=0;i<8;i++)call(a,"failedProbe",new Class<?>[]{String.class,boolean.class},"network",true);
                assertEquals("100.64.0.1:4319",get(a,"currentTarget"));
                set(a,"nextProbeAt",0L);assertEquals(false,call(a,"shouldProbe"));
                set(a,"lastRecoveryWake",-30000L);call(a,"wakeRecovery");assertEquals(true,call(a,"shouldProbe"));
                call(a,"failedProbe",new Class<?>[]{String.class,boolean.class},"HTTP 403",false);
                set(a,"lastRecoveryWake",-30000L);call(a,"wakeRecovery");set(a,"nextProbeAt",0L);
                assertEquals(false,call(a,"shouldProbe"));assertEquals(true,get(a,"retryBlocked"));
                set(a,"foreground",false);
            });
        }
    }
    @Test public void firstDocument502RecoversFromAutomaticProbeContinuationButEstablishedPageNeverReloads() throws Exception {
        try(Server server=new Server();ActivityScenario<MainActivity> s=launch()){
            server.code.set(502);
            s.onActivity(a->call(a,"buildWebView",new Class<?>[]{String.class,String.class},server.origin(),"new-token"));
            waitFor(()->integer(s,"retryFailures")>0,"HTTP failure");
            assertFalse(bool(s,"documentReady"));assertFalse(bool(s,"pageLoading"));
            server.code.set(200);
            AtomicReference<WebView> failed=new AtomicReference<>();
            // Exercise the production UI continuation with a controlled read-only probe result.
            // This covers WebView recovery, not a real tsnet health check.
            JSONObject probe=new JSONObject().put("ok",true);
            s.onActivity(a->{
                failed.set((WebView)get(a,"web"));WebViewClient client=failed.get().getWebViewClient();
                set(a,"foreground",true);set(a,"currentTarget","100.64.0.1:4319");set(a,"nextProbeAt",0L);
                assertEquals(true,call(a,"shouldProbe"));
                call(a,"applyProbeResult",new Class<?>[]{int.class,JSONObject.class,String.class,String.class},get(a,"generation"),probe,server.origin(),"new-token");
                set(a,"foreground",false);
                assertNotSame(failed.get(),get(a,"web"));
                client.onPageCommitVisible(failed.get(),server.origin()+"/");
                assertEquals(false,get(a,"documentReady"));
            });
            waitFor(()->bool(s,"documentReady"),"successful retry");
            js(s,"draft.value='preserved';window.sentinel=Math.random()");String before=js(s,"draft.value+'|'+sentinel");
            s.onActivity(a->{
                WebView web=(WebView)get(a,"web");
                web.getWebViewClient().onReceivedHttpError(web,new Request(server.origin()+"/",true),new WebResourceResponse("text/plain","UTF-8",502,"Bad Gateway",Collections.emptyMap(),new ByteArrayInputStream(new byte[0])));
                assertEquals(0,get(a,"retryFailures"));assertReadyBlocksProbe(a);
                WebView established=(WebView)get(a,"web");set(a,"foreground",true);
                call(a,"applyProbeResult",new Class<?>[]{int.class,JSONObject.class,String.class,String.class},get(a,"generation"),probe,server.origin(),"new-token");
                set(a,"foreground",false);assertSame(established,get(a,"web"));
            });
            assertEquals(before,js(s,"draft.value+'|'+sentinel"));
        }
    }
    private void assertReadyBlocksProbe(MainActivity a){
        set(a,"foreground",true);set(a,"currentTarget","100.64.0.1:4319");
        set(a,"pageLoading",false);set(a,"loading",false);set(a,"busy",false);
        set(a,"retryBlocked",false);set(a,"retryFailures",0);set(a,"nextProbeAt",0L);
        assertTrue((Boolean)get(a,"documentReady"));assertEquals(false,call(a,"shouldProbe"));
        set(a,"documentReady",false);assertEquals(true,call(a,"shouldProbe"));
        set(a,"documentReady",true);set(a,"foreground",false);
    }
    private String js(ActivityScenario<MainActivity> s,String code)throws Exception{
        CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        s.onActivity(a->((WebView)get(a,"web")).evaluateJavascript(code,v->{value.set(v);latch.countDown();}));assertTrue(latch.await(5,TimeUnit.SECONDS));return value.get();
    }
    private boolean bool(ActivityScenario<MainActivity>s,String n){AtomicReference<Boolean> r=new AtomicReference<>();s.onActivity(a->r.set((Boolean)get(a,n)));return r.get();}
    private int integer(ActivityScenario<MainActivity>s,String n){AtomicInteger r=new AtomicInteger();s.onActivity(a->r.set((Integer)get(a,n)));return r.get();}
    private void waitFor(java.util.function.BooleanSupplier check,String label)throws Exception{for(int i=0;i<100;i++){if(check.getAsBoolean())return;Thread.sleep(100);}fail(label);}
    private static Object get(MainActivity a,String n){try{Field f=MainActivity.class.getDeclaredField(n);f.setAccessible(true);return f.get(a);}catch(Exception e){throw new AssertionError(e);}}
    private static void set(MainActivity a,String n,Object v){try{Field f=MainActivity.class.getDeclaredField(n);f.setAccessible(true);f.set(a,v);}catch(Exception e){throw new AssertionError(e);}}
    private static Object call(MainActivity a,String n){return call(a,n,new Class<?>[0]);}
    private static Object call(MainActivity a,String n,Class<?>[] types,Object... args){try{Method m=MainActivity.class.getDeclaredMethod(n,types);m.setAccessible(true);return m.invoke(a,args);}catch(Exception e){throw new AssertionError(e);}}
    private static final class Request implements android.webkit.WebResourceRequest{
        final android.net.Uri uri;final boolean main;final String method;
        Request(String u,boolean m){this(u,m,"GET");}
        Request(String u,boolean m,String verb){uri=android.net.Uri.parse(u);main=m;method=verb;}
        public android.net.Uri getUrl(){return uri;}public boolean isForMainFrame(){return main;}public boolean hasGesture(){return false;}public boolean isRedirect(){return false;}public String getMethod(){return method;}public java.util.Map<String,String> getRequestHeaders(){return Collections.emptyMap();}
    }
    static final class Server implements AutoCloseable{
        final ServerSocket listener;final ExecutorService worker=Executors.newSingleThreadExecutor();
        final String html;
        final AtomicInteger requests=new AtomicInteger(),code=new AtomicInteger(200),oldCookies=new AtomicInteger();final AtomicReference<String> cookie=new AtomicReference<>("");
        Server()throws IOException{this("<meta name='viewport' content='width=device-width'><textarea id='draft'></textarea><script>window.sentinel='loaded'</script>");}
        Server(String html)throws IOException{
            this.html=html;
            listener=new ServerSocket(0,10,InetAddress.getByName("127.0.0.1"));
            worker.submit(()->{while(!listener.isClosed())try(Socket socket=listener.accept()){
                socket.setSoTimeout(5000);BufferedReader reader=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.UTF_8));
                String first=reader.readLine(),line;while((line=reader.readLine())!=null&&!line.isEmpty())if(line.toLowerCase().startsWith("cookie:")){cookie.set(line);if(line.contains("old-token"))oldCookies.incrementAndGet();}
                if(first==null)continue;
                int status=code.get();byte[] body=(status==200?html:"Unavailable").getBytes(StandardCharsets.UTF_8);
                OutputStream out=socket.getOutputStream();out.write(("HTTP/1.1 "+status+(status==200?" OK":" Bad Gateway")+"\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: "+body.length+"\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(body);out.flush();requests.incrementAndGet();
            }catch(IOException ignored){}});
        }
        String origin(){return "http://127.0.0.1:"+listener.getLocalPort();}
        public void close()throws Exception{listener.close();worker.shutdownNow();assertTrue(worker.awaitTermination(6,TimeUnit.SECONDS));}
    }
}
