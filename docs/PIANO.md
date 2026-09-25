# Piano – UniBG Orari → Google Calendar Sync

## Verifiche empiriche (25/09/2026, con curl)

| Verifica                                   | Esito                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `combo.php?sw=ec_&aa=1`                    | JS `var anni_accademici_ec = {...};` → 2026, 2025, 2024. Salvata in `fixtures/combo_anni.js`.                                                                                                                                                                                                                                                                             |
| `combo.php?...&page=corsi`                 | Identica alla fixture (80 corsi). La fixture fornita è "pretty-printed", la risposta live è minificata e usa `var x = ...;` con spazi: il parser gestisce entrambe (`fixtures/combo_corsi_2026_raw.js`).                                                                                                                                                                  |
| `grid_call.php` con il payload del browser | Celle identiche alla fixture (239). **Nessun cookie di sessione richiesto.**                                                                                                                                                                                                                                                                                              |
| Più `anno2[]`                              | Funziona (372 lezioni = 237 + 135, `id` univoci). `txtcurr` vuoto o valorizzato non cambia i dati.                                                                                                                                                                                                                                                                        |
| `all_events=1` con `date` fuori periodo    | Restituisce **il periodo che contiene `date` più tutti i successivi pubblicati**. Se `date` è tra due periodi → i periodi successivi. Se `date` è dopo l'ultimo periodo (o nessun periodo successivo è pubblicato) → **tutto l'A.A.** pubblicato. Verificato su A.A. 2025 (S1+S2 pubblicati): ottobre → S1+S2 (431), gennaio → solo S2 (206), marzo → S2, luglio → tutto. |
| `date_inizio_fine_curriculum`              | Popolato solo quando `date` cade dentro un periodo del **corrente** A.A.; spesso `[]`. Usato solo per la UI, mai per la logica.                                                                                                                                                                                                                                           |
| `file_timestamp`                           | Cambia ogni volta che il server rigenera la cache (19:20, 19:40…), indipendentemente da modifiche reali. **Non affidabile → ottimizzazione rimossa**: il diff (puro, economico) gira sempre; `file_date` è solo mostrato in UI.                                                                                                                                           |
| `tipo` delle celle                         | Oltre a `Lezione`/`LEZ`: `Tutorato`/`TUT`, `Prova in itinere`/`PITI`, `Recupero lezione`/`REC`, e `chiusura_type`. Tutto ciò che non è `chiusura_type` è un evento didattico.                                                                                                                                                                                             |
| Esercitazioni                              | Il prefisso prima di `_ES` **non** coincide sempre con il codice del corso principale (`EC41298_ES_B` vs `EC172165`). Raggruppamento: prima per prefisso, poi aggancio al corso principale per codice **o** per nome normalizzato.                                                                                                                                        |
| Mojibake                                   | `Ã\u0080` (À), `Ã¯`, `Ã©` nelle risposte 2025.                                                                                                                                                                                                                                                                                                                            |
| Indirizzo sede                             | Non c'è un campo dedicato: si estrae dall'URL dell'iframe `maps` (`!2sVia+Albert+Einstein%2C+24044+Dalmine+BG`).                                                                                                                                                                                                                                                          |

Fixture aggiunte: `combo_anni.js`, `combo_corsi_2026_raw.js`, `grid_call_2025_…_date-15-10-2025.json` (S1+S2, tutti i tipi), `grid_call_2025_…_date-20-01-2026.json` (solo S2), `grid_call_21-R_PDS0-2012-1+2.json` (multi-percorso), `grid_call_21-R_PDS0-2012-1_week.json` (`all_events=0`).

## Strategia periodi (conseguenza delle verifiche)

- A ogni giro: **una** chiamata con `date = oggi`, `all_events=1`. Copre periodo corrente + tutti i successivi pubblicati, quindi il semestre successivo compare da solo appena pubblicato: la chiamata extra "DataFine + 21 giorni" non serve.
- Finestra coperta = `first_day → last_day` della risposta. Una lezione sparita viene marcata "rimossa" solo se era dentro la finestra e non è passata.
- Nuovo A.A.: job giornaliero su `combo.php` → banner "È disponibile l'A.A. …".

## Stack

Next.js 16.3 (App Router, `proxy.ts`), TypeScript strict, Tailwind 4 + shadcn/ui, Drizzle + better-sqlite3, `@googleapis/calendar` + `google-auth-library` (moduli ufficiali del monorepo googleapis, molto più leggeri del pacchetto `googleapis`), Zod 4, date-fns + date-fns-tz, node-cron 4, pino, Vitest 5, jose (cookie di sessione firmato).

## Struttura

```
app/                      pagine sottili + route handlers
  (app)/page.tsx          dashboard
  (app)/configs/new       wizard
  (app)/configs/[id]      dettaglio / modifica
  login/
  api/auth/google/…       OAuth start + callback, logout
  api/sync/route.ts       POST, Bearer CRON_SECRET
  api/runs/[id]/route.ts  avanzamento sync
  api/health/route.ts
components/<feature>/     wizard, preview, dashboard, ui (shadcn)
lib/easystaff/            http, combo, grid, schemas, normalize, courses, text (fixMojibake/htmlToText)
lib/google/               oauth, crypto, tokens, calendars, events
lib/sync/                 types, diff (puro), safety, event (render puro), plan, run, ids
lib/db/                   schema, client, migrate, repo
lib/env.ts, lib/log.ts, lib/lock.ts
worker/index.ts           node-cron
drizzle/                  migrazioni SQL
fixtures/                 risposte reali
```

## Schema DB

- `google_account` (1 riga): email, refresh token cifrato AES-256-GCM, scope concessi, stato (`ok` / `invalid_grant`).
- `easystaff_cache`: chiave (`anni`, `corsi:<aa>`), corpo, `fetched_at` (TTL 24 h).
- `sync_config`: A.A., corso, percorsi (JSON), insegnamenti selezionati / esclusi / in attesa (JSON), calendario, opzioni evento (JSON), iniziale cognome, stato (`draft` / `active` / `paused` / `error`), motivo pausa, anomalie consecutive, finestra, `file_date`, conteggi, timestamp.
- `lesson_snapshot`: PK (`config_id`, `source_id`), `google_event_id`, `content_hash`, `event_hash` (hash del corpo evento scritto), `status` (`active` / `cancelled` / `removed`), `lesson_json`, `cancelled_at`, `removed_at`, `first_seen_at`, `last_seen_at`, `last_synced_at`.
- `sync_run`: trigger, dry-run, stato, avanzamento (`done` / `total`), contatori, errore.
- `sync_log`: livello, tipo, messaggio leggibile, dettagli JSON.
- `lock`: nome, holder, scadenza.
- `app_state`: chiave/valore (ultimo A.A. noto, ultimo refresh combo…).

## Tipi principali

```ts
type Lesson = {
  sourceId;
  courseCode;
  courseName;
  title;
  start;
  end;
  room;
  roomCode;
  site;
  address;
  teacher;
  kind;
  required;
  cancelled;
  notes;
  contentHash;
};
type Action =
  | { type: "insert"; lesson }
  | { type: "patch"; lesson; prev; changes: FieldChange[]; transition: "cancelled" | "restored" | "reappeared" | null }
  | { type: "markRemoved"; prev }
  | { type: "move"; prev; lesson } // vecchio evento eliminato, nuovo creato
  | { type: "delete"; prev; reason: "deselected" };
```

## Scelte da confermare / dubbi

1. **`events.update` (PUT) invece di `events.patch`** per le modifiche: la doc Google indica che `patch` costa 3 unità di quota e non può togliere un campo omettendolo (es. `colorId: "11"` dopo il ripristino di una lezione annullata). `update` con il corpo completo è deterministico. Upsert: `update` → 404/410 → `insert` → 409 → `update` con `status: "confirmed"`.
2. **Prefisso tipo nel titolo**: default "solo se non è una Lezione" (es. `[Prova in itinere] ANALISI MATEMATICA I`), perché esistono Tutorato / Prova in itinere / Recupero. Modificabile.
3. **Iniziale cognome**: se più gruppi sono compatibili (es. "R" → M-Z e P-Z) li preseleziono tutti e mostro un avviso.
4. **Scope**: `calendar.app.created` è lo scope minimo per `calendars.insert`; viene chiesto in modo incrementale solo quando si sceglie "Crea nuovo calendario".
5. **"Disattiva e rimuovi eventi"**: elimina tutti gli eventi marcati con quel `configId`, anche passati (con conferma esplicita).
6. Lo snapshot tiene anche `event_hash`: se cambi le opzioni (titolo, promemoria, colore) gli eventi futuri vengono riscritti una volta, poi zero scritture.
7. **ID evento**: `unibg<configId>s<sourceId>`. La `x` proposta come separatore non è un carattere base32hex (Google accetta solo `a-v` e `0-9`), quindi il separatore è `s`; `configId` è esadecimale (8 caratteri) e non contiene mai `s`.
8. Per le lezioni mai sincronizzate l'upsert prova direttamente `insert` (poi 409 → `update`): al primo sync evita ~200 chiamate che finirebbero in 404.
9. Oltre alle 4 proprietà private richieste, ogni evento ha anche `courseCode`: serve a ricostruire lo stato da Google (`events.list` con `privateExtendedProperty`) se il DB va perso.
10. Soglia del 30%: applicata alle lezioni **future** degli insegnamenti selezionati, confrontate allo stesso istante e solo dentro la finestra della nuova risposta, e solo se ne erano attese almeno 10. Così il cambio di semestre e la fine delle lezioni non generano falsi allarmi.

## Revisione: service account al posto di OAuth (25/09/2026)

- **Google**: service account con chiave JSON (`GOOGLE_SERVICE_ACCOUNT_KEY_FILE` o `GOOGLE_SERVICE_ACCOUNT_JSON`). Rimossi flusso `/api/auth/google`, refresh token, `ENCRYPTION_KEY`, tabella `google_account` (migrazione `0001_drop_google_account`).
- **Scope**: `calendar.events` + `calendar.calendarlist`. Il secondo è necessario: `calendarList.insert` e `calendarList.list` non accettano il solo `calendar.events`. Per un service account gli scope non passano da una schermata di consenso.
- **Calendario**: l'utente condivide il calendario con l'email del service account ("Apportare modifiche agli eventi") e incolla l'ID; l'app fa `calendarList.insert` e una scrittura di prova (evento del 1/1/2000 creato e cancellato). La dropdown mostra la calendarList del service account (writer/owner). Niente "crea calendario".
- **Controllo a ogni giro**: prima di scrivere, `calendarList.get` (ed eventualmente re-insert) verifica che il calendario sia ancora condiviso in scrittura. Se non lo è: configurazione in stato "error", un solo messaggio nel registro, nessuna scrittura; il worker riprova e torna "active" da solo.
- **Credenziali rifiutate** (`invalid_grant`, verificato dal vivo con una chiave finta): tutte le configurazioni in pausa, banner in dashboard, ripresa automatica quando la chiave torna valida.
- **UI**: password unica `APP_PASSWORD` (in chiaro, hashata con bcrypt in memoria, oppure hash bcrypt), cookie di sessione httpOnly firmato (HS256) che scade se la password cambia, limite di 5 tentativi per IP e 20 totali ogni 15 minuti.
- **`$` negli hash bcrypt** (verificato): il loader `.env` di Next espande `$` (serve `\$`), Docker Compose `env_file` richiede apici singoli, `node --env-file` accetta il valore grezzo. `pnpm hash-password` stampa le due forme.
- **Eventi**: mai `attendees` (un service account non può invitare senza domain-wide delegation).
