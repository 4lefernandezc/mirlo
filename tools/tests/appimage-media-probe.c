// Diagnostic harness for the WebKitGTK shipped inside an extracted AppImage.
// Build/run instructions: docs/research/appimage-clean-room.md.
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
        "passed:window.samples.every(x=>x.audio.ended && x.audio.currentTime>5 && !x.audio.error),"
        "samples:window.samples.map(x=>({type:x.type,status:x.status,time:x.audio.currentTime,"
        "duration:Number.isFinite(x.audio.duration)?x.audio.duration:null,"
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
    webkit_web_view_load_html(view,
        "<!doctype html><title>Mirlo codec probe</title><script>"
        "window.samples=['webm','m4a'].map(type=>{let audio=new Audio('tone.'+type);"
        "audio.muted=true;let x={type,audio,status:'pending'};audio.play().then("
        "()=>x.status='playing',e=>x.status=e.name+': '+e.message);return x})</script>",
        argc > 1 ? argv[1] : "file:///results/");
    g_timeout_add_seconds(12, report, view);
    g_timeout_add_seconds(25, deadline, NULL);
    gtk_main();
    return exit_status;
}
