// Diagnostic harness for the WebKitGTK shipped inside an extracted AppImage.
// Build/run: docs/research/appimage-clean-room.md; optional --h264 checks decoded pixels.
#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <stdio.h>
#include <string.h>

static int exit_status = 2;

static void result(GObject *object, GAsyncResult *async, gpointer data) {
    (void)data;
    GError *error = NULL;
    WebKitJavascriptResult *r = webkit_web_view_run_javascript_finish(
        WEBKIT_WEB_VIEW(object), async, &error);
    if (!r) {
        fprintf(stderr, "JS probe failed: %s\n", error->message);
        g_error_free(error);
    } else {
        char *json = jsc_value_to_string(webkit_javascript_result_get_js_value(r));
        puts(json);
        exit_status = strstr(json, "\"passed\":true") ? 0 : 1;
        g_free(json);
        webkit_javascript_result_unref(r);
    }
    gtk_main_quit();
}

static gboolean report(gpointer view) {
    webkit_web_view_run_javascript(WEBKIT_WEB_VIEW(view),
        "JSON.stringify({"
        "caps:{aac:MediaSource.isTypeSupported('audio/mp4; codecs=\"mp4a.40.2\"'),"
        "opus:MediaSource.isTypeSupported('audio/webm; codecs=\"opus\"'),"
        "h264:MediaSource.isTypeSupported('video/mp4; codecs=\"avc1.42E01E\"')},"
        "passed:window.samples.every(x=>x.audio.ended && x.audio.currentTime>5 && !x.audio.error"
        " && (x.type!=='mp4' || (x.audio.videoWidth===320 && x.audio.videoHeight===180"
        " && x.frameHashes.length>=3))),"
        "samples:window.samples.map(x=>({type:x.type,status:x.status,time:x.audio.currentTime,"
        "duration:Number.isFinite(x.audio.duration)?x.audio.duration:null,"
        "decodedFrames:x.type==='mp4'?window.frames(x.audio):null,"
        "distinctFrames:x.type==='mp4'?x.frameHashes.length:null,"
        "frameError:x.frameError||null,"
        "width:x.type==='mp4'?x.audio.videoWidth:null,"
        "height:x.type==='mp4'?x.audio.videoHeight:null,"
        "ended:x.audio.ended,error:x.audio.error?x.audio.error.code:null}))})",
        NULL, result, NULL);
    return G_SOURCE_REMOVE;
}

static gboolean deadline(gpointer data) {
    (void)data;
    fprintf(stderr, "Probe timed out\n");
    gtk_main_quit();
    return G_SOURCE_REMOVE;
}

int main(int argc, char **argv) {
    gtk_init(&argc, &argv);
    GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    WebKitWebView *view = WEBKIT_WEB_VIEW(webkit_web_view_new());
    webkit_settings_set_media_playback_requires_user_gesture(
        webkit_web_view_get_settings(view), FALSE);
    gtk_container_add(GTK_CONTAINER(window), GTK_WIDGET(view));
    gtk_widget_show_all(window);
    const gboolean h264 = argc > 2 && strcmp(argv[2], "--h264") == 0;
    // WebKit's frame counters can stay at zero; changing canvas pixels prove decoding.
    char *html = g_strdup_printf(
        "<!doctype html><title>Mirlo codec probe</title><script>"
        "window.frames=v=>v.getVideoPlaybackQuality?.().totalVideoFrames||v.webkitDecodedFrameCount||0;"
        "window.samples=['webm','m4a'%s].map(type=>{"
        "let audio=type==='mp4'?document.createElement('video'):new Audio();"
        "if(type==='mp4'){audio.width=320;audio.height=180;document.documentElement.append(audio)}"
        "audio.src=type==='mp4'?'h264.mp4':'tone.'+type;"
        "audio.muted=true;let x={type,audio,status:'pending',frameHashes:[]};"
        "if(type==='mp4'){let canvas=document.createElement('canvas');canvas.width=64;canvas.height=36;"
        "let ctx=canvas.getContext('2d',{willReadFrequently:true});let timer=setInterval(()=>{"
        "if(audio.readyState>=2){try{ctx.drawImage(audio,0,0,64,36);"
        "let data=ctx.getImageData(0,0,64,36).data;let hash=2166136261;"
        "for(let i=0;i<data.length;i++)hash=Math.imul(hash^data[i],16777619);"
        "if(!x.frameHashes.includes(hash))x.frameHashes.push(hash)"
        "}catch(e){x.frameError=e.name}}if(audio.ended)clearInterval(timer)},250)}"
        "audio.play().then("
        "()=>x.status='playing',e=>x.status=e.name+': '+e.message);return x})</script>",
        h264 ? ",'mp4'" : "");
    webkit_web_view_load_html(view, html, argc > 1 ? argv[1] : "file:///results/");
    g_free(html);
    g_timeout_add_seconds(12, report, view);
    g_timeout_add_seconds(25, deadline, NULL);
    gtk_main();
    return exit_status;
}
