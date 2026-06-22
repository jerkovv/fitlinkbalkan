#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Bridge fajl - registruje LiveActivityPlugin sa Capacitor runtime-om.
// Ime "LiveActivity" je sto JS koristi: registerPlugin<LiveActivityPlugin>('LiveActivity').
CAP_PLUGIN(LiveActivityPlugin, "LiveActivity",
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(update, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(end, CAPPluginReturnPromise);
)
