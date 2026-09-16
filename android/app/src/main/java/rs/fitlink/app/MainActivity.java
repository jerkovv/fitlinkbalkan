package rs.fitlink.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Servis koji drzi trening zivim dok je telefon u dzepu (vidi TreningServis).
        registerPlugin(TreningServisPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
