#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Bridge fajl - registruje WatchSyncPlugin sa Capacitor runtime-om.
// Ime "WatchSync" je sto JS koristi: registerPlugin<WatchSyncPlugin>('WatchSync').
CAP_PLUGIN(WatchSyncPlugin, "WatchSync",
    CAP_PLUGIN_METHOD(sendTokenToWatch, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(clearWatchToken, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isWatchPaired, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isWatchAppInstalled, CAPPluginReturnPromise);
)
