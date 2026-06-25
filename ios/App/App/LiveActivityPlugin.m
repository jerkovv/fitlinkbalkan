#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Bridge fajl - registruje LiveActivityPlugin sa Capacitor runtime-om.
// Ime "LiveActivity" je sto JS koristi: registerPlugin<LiveActivityPlugin>('LiveActivity').
CAP_PLUGIN(LiveActivityPlugin, "LiveActivity",
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(update, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(end, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(precache, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(trainerStart, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(trainerUpdate, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(trainerEnd, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(trainerStatus, CAPPluginReturnPromise);
)
