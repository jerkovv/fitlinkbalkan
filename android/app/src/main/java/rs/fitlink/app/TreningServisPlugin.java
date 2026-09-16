package rs.fitlink.app;

import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Most iz aplikacije: pali i gasi TreningServis dok traje trening. */
@CapacitorPlugin(name = "TreningServis")
public class TreningServisPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), TreningServis.class);
            getContext().startForegroundService(i);
            call.resolve();
        } catch (Exception e) {
            // Servis nije kriticni deo treninga: bez njega se samo gubi puls u pozadini.
            call.reject("Servis nije pokrenut: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), TreningServis.class));
            call.resolve();
        } catch (Exception e) {
            call.reject("Servis nije zaustavljen: " + e.getMessage());
        }
    }
}
