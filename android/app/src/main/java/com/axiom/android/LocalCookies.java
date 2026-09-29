package com.axiom.android;

import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import java.util.ArrayDeque;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Process-wide FIFO on the UI thread: old asynchronous clears cannot erase a new token. */
final class LocalCookies {
    private static final ArrayDeque<Consumer<Runnable>> queue=new ArrayDeque<>();
    private static boolean active=false;
    private static void enqueue(Consumer<Runnable> operation){
        if(Looper.myLooper()!=Looper.getMainLooper())throw new IllegalStateException("Cookie operation off UI thread");
        queue.add(operation);drain();
    }
    private static void drain(){
        if(active||queue.isEmpty())return;
        active=true;
        queue.remove().accept(()->{active=false;drain();});
    }
    static void clear(){enqueue(done->CookieManager.getInstance().removeAllCookies(ignored->done.run()));}
    static void set(String origin,String token,BooleanSupplier valid,ValueCallback<Boolean> result){
        enqueue(done->{
            if(!valid.getAsBoolean()){done.run();return;}
            CookieManager.getInstance().setCookie(origin+"/","axiom_local_session="+token+"; Path=/; HttpOnly; SameSite=Strict",ok->{
                try{if(valid.getAsBoolean())result.onReceiveValue(ok);}finally{done.run();}
            });
        });
    }
    private LocalCookies(){}
}
