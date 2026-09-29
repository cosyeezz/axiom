package com.axiom.android;

import android.app.Instrumentation;
import android.os.Handler;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** State-machine regressions: no Activity launch, saved target or tailnet credentials. */
public final class LifecycleRegressionTest {
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private MainActivity fixture(){
        AtomicReference<MainActivity> ref=new AtomicReference<>();
        instrumentation.runOnMainSync(()->{
            MainActivity a=new MainActivity();
            put(a,"address",new EditText(instrumentation.getTargetContext()));
            put(a,"login",new Button(instrumentation.getTargetContext()));
            put(a,"status",new TextView(instrumentation.getTargetContext()));
            ref.set(a);
        });
        return ref.get();
    }
    @Test public void queuedStatusKeepsGuardUntilCompletionAfterBackgrounding() throws Exception {
        MainActivity a=fixture();
        ExecutorService network=(ExecutorService)get(null,"NETWORK");
        CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        Future<?> blocker=null;
        try {
            blocker=network.submit(()->{
                entered.countDown();
                try { if(!release.await(15,TimeUnit.SECONDS))throw new AssertionError("blocker timed out"); }
                catch(InterruptedException e){Thread.currentThread().interrupt();throw new AssertionError(e);}
            });
            assertTrue("NETWORK did not reach blocker",entered.await(5,TimeUnit.SECONDS));
            instrumentation.runOnMainSync(()->{
                put(a,"foreground",true);
                invoke(a,"refreshStatus");
                assertEquals(Boolean.TRUE,get(a,"statusInFlight"));
                Runnable poll=(Runnable)get(a,"poll");
                for(int i=0;i<20;i++){poll.run();assertEquals(Boolean.TRUE,get(a,"statusInFlight"));}
                assertEquals(Boolean.FALSE,get(a,"busy"));
                // Skip native work when the queued task finally starts.
                put(a,"foreground",false);
                ((Handler)get(a,"handler")).removeCallbacks(poll);
                assertEquals(Boolean.TRUE,get(a,"statusInFlight"));
            });
            release.countDown();blocker.get(5,TimeUnit.SECONDS);
            network.submit(()->{}).get(5,TimeUnit.SECONDS);
            instrumentation.runOnMainSync(()->{
                assertEquals(Boolean.FALSE,get(a,"statusInFlight"));
                assertNull(get(a,"web"));
            });
        } finally {
            dispose(a);release.countDown();
            if(blocker!=null)blocker.get(5,TimeUnit.SECONDS);
            network.submit(()->{}).get(5,TimeUnit.SECONDS);
            dispose(a);
        }
    }
    @Test public void emptyRetryInvalidatesOldTargetBeforeRunningSnapshot() throws Exception {
        MainActivity a=fixture();
        JSONObject running=new JSONObject().put("running",true).put("needsLogin",false).put("message","running");
        try {
            instrumentation.runOnMainSync(()->{
                put(a,"currentTarget","100.64.0.1:4319");
                put(a,"authUrl","https://login.tailscale.com/old");
                ((EditText)get(a,"address")).setText("   ");
                int generation=(Integer)get(a,"generation");
                invoke(a,"startConnection");
                assertEquals(generation+1,((Integer)get(a,"generation")).intValue());
                assertEquals("",get(a,"currentTarget"));assertEquals("",get(a,"authUrl"));
                assertEquals(Boolean.FALSE,get(a,"busy"));
                invoke(a,"renderStatus",new Class<?>[]{JSONObject.class},running);
                assertEquals(Boolean.FALSE,get(a,"loading"));
                assertEquals(Boolean.FALSE,get(a,"busy"));assertNull(get(a,"web"));
            });
        } finally {dispose(a);}
    }
    private void dispose(MainActivity a){
        instrumentation.runOnMainSync(()->{
            put(a,"foreground",false);put(a,"destroyed",true);
            put(a,"generation",(Integer)get(a,"generation")+1);
            ((Handler)get(a,"handler")).removeCallbacksAndMessages(null);
        });
    }
    private static Object get(MainActivity a,String name){
        try {Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(a);}
        catch(ReflectiveOperationException e){throw new AssertionError(e);}
    }
    private static void put(MainActivity a,String name,Object value){
        try {Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);f.set(a,value);}
        catch(ReflectiveOperationException e){throw new AssertionError(e);}
    }
    private static void invoke(MainActivity a,String name){invoke(a,name,new Class<?>[0]);}
    private static void invoke(MainActivity a,String name,Class<?>[] types,Object... args){
        try {Method m=MainActivity.class.getDeclaredMethod(name,types);m.setAccessible(true);m.invoke(a,args);}
        catch(ReflectiveOperationException e){throw new AssertionError(e);}
    }
}
