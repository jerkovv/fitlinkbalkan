package rs.fitlink.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * Servis koji drzi trening zivim dok je telefon u dzepu.
 *
 * Bez njega Android uspava aplikaciju cim se ekran zakljuca: veza sa senzorom pulsa
 * pukne ili dogadjaji prestanu da stizu, pa trening zavrsi sa pulsom samo za deo
 * vremena. Sa obavestenjem u statusnoj traci proces ostaje ziv do kraja treninga.
 *
 * Tip servisa je "connectedDevice" (Android 14+ trazi tip): mi zaista drzimo vezu sa
 * spoljnim uredjajem koji meri puls.
 */
public class TreningServis extends Service {

    public static final String KANAL = "fitlink_trening";
    private static final int ID_OBAVESTENJA = 4201;

    @Override
    public void onCreate() {
        super.onCreate();
        napraviKanal();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification obavestenje = napraviObavestenje();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(ID_OBAVESTENJA, obavestenje, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        } else {
            startForeground(ID_OBAVESTENJA, obavestenje);
        }
        // Sistem sme da ubije servis kad je memorija tesna; ne dizemo ga sami ponovo,
        // jer trening tada ionako vise nije na ekranu.
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void napraviKanal() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        // Tih kanal: obavestenje je samo znak da trening radi, ne poruka.
        NotificationChannel kanal = new NotificationChannel(KANAL, "Trening u toku", NotificationManager.IMPORTANCE_LOW);
        kanal.setDescription("Dok traje trening, FitLink beleži puls i šalje ga treneru.");
        kanal.setShowBadge(false);
        nm.createNotificationChannel(kanal);
    }

    private Notification napraviObavestenje() {
        Intent otvori = new Intent(this, MainActivity.class);
        otvori.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent klik = PendingIntent.getActivity(
            this, 0, otvori, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, KANAL)
            .setContentTitle("Trening u toku")
            .setContentText("FitLink beleži puls i šalje ga treneru.")
            .setSmallIcon(R.drawable.ic_stat_fitlink)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setContentIntent(klik)
            .build();
    }
}
