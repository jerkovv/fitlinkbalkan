# FitLink — Supabase setup za email invite

Pošto koristiš sopstveni Supabase projekat (ne Lovable Cloud), ova dva fajla
moraš deploy-ovati ručno. Posle toga sve radi automatski iz aplikacije.

## 1. SQL migracija (30 sec)

Otvori Supabase Dashboard → **SQL Editor → New query** i zalepi sadržaj:

`01_invites_email.sql`

Klikni **Run**. Dodaje kolone `email`, `full_name`, `sent_at` na `invites` tabelu.

## 2. Edge Function (3 min)

### Opcija A — Supabase Dashboard (najlakše)

1. **Edge Functions → Create a new function**
2. Naziv: **`send-invite`** (tačno tako, frontend zove pod ovim imenom)
3. Zalepi sav sadržaj iz `02_send-invite/index.ts`
4. Klikni **Deploy function**

### Opcija B — Supabase CLI

```bash
# U root-u projekta:
mkdir -p supabase/functions/send-invite
cp SUPABASE_SETUP/02_send-invite/index.ts supabase/functions/send-invite/index.ts
supabase functions deploy send-invite
```

## 3. Email Template (opciono ali preporučeno)

Default Supabase invite email je suvoparan. Da ga prebrendiraš:

1. Supabase Dashboard → **Authentication → Email Templates → Invite user**
2. Subject: `Pozvan si na FitLink 💪`
3. Body (HTML):

```html
<h2>Zdravo!</h2>
<p>Tvoj trener te poziva da koristiš <strong>FitLink</strong> aplikaciju za praćenje
treninga i ishrane.</p>
<p style="margin: 24px 0;">
  <a href="{{ .ConfirmationURL }}"
     style="background:#7C3AED;color:#fff;padding:14px 28px;border-radius:12px;
            text-decoration:none;font-weight:bold;display:inline-block;">
    Prihvati poziv
  </a>
</p>
<p style="color:#666;font-size:13px;">Link važi 7 dana. Ako nisi očekivao ovaj poziv,
samo ga ignoriši.</p>
```

## 4. Site URL

Supabase mora znati gde da redirect-uje posle klika u mejlu:

1. Dashboard → **Authentication → URL Configuration**
2. **Site URL**: stavi tvoj produkcioni URL (npr. `https://fitlink.lovable.app`)
3. **Redirect URLs**: dodaj `https://fitlink.lovable.app/invite/*` i preview URL

---

## Kako radi flow

1. Trener u app-u klikne **"Pozovi vežbača"** → upiše ime + email
2. Frontend zove `send-invite` edge funkciju
3. Funkcija pravi `invites` zapis + šalje Supabase invite mejl
4. Vežbač dobija mejl, klikne **"Prihvati poziv"**
5. Otvara se `/invite/:code` — već je auth-ovan preko magic linka,
   samo postavi password i ime, automatski je vezan za trenera
