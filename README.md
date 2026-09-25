# UniBG Orari → Google Calendar

App web personale (self-hosted, un solo utente) che legge gli orari UniBG da EasyStaff "Agenda Web" e li scrive su un tuo calendario Google tramite la Calendar API. Ogni 15 minuti ricontrolla l'orario e aggiorna gli eventi se una lezione cambia orario, aula o docente, viene annullata, aggiunta o rimossa.

- **Wizard**: anno accademico → dipartimento → corso → anni/percorsi → insegnamenti (con i gruppi di esercitazione della tua lettera) → anteprima → calendario → opzioni.
- **Dashboard**: stato, ultima/prossima esecuzione, registro leggibile delle modifiche, "Sincronizza ora" con anteprima (dry-run), pausa, "Disattiva e rimuovi eventi".
- **Sicurezza sul tuo calendario**: l'app legge, modifica e cancella solo gli eventi che ha creato (marcati `source=unibg-sync`).

## 1. Google: service account

L'app scrive sul calendario come **service account** (un account "robot" con chiave JSON): niente login Google, niente schermata di consenso, niente refresh token che scade. Il calendario lo condividi tu, a mano, con l'email del service account.

1. Vai su <https://console.cloud.google.com/>, crea un progetto (es. "unibg-calendar-sync").
2. **API e servizi → Libreria**: abilita **Google Calendar API**.
3. **IAM e amministrazione → Account di servizio → Crea account di servizio**: nome es. `unibg-sync`. Ruoli e accessi al progetto non servono: salta quei passaggi e premi _Fine_.
4. Apri il service account → scheda **Chiavi → Aggiungi chiave → Crea nuova chiave → JSON**. Il browser scarica un file `.json`: è la chiave privata.
5. Mettila nel progetto come `secrets/google-service-account.json`:

   ```bash
   mkdir -p secrets && chmod 700 secrets
   mv ~/Scaricati/progetto-xxxx.json secrets/google-service-account.json
   chmod 600 secrets/google-service-account.json
   ```

   ⚠️ **La chiave non va mai nel repository.** `secrets/` e `*service-account*.json` sono in `.gitignore` e `.dockerignore`: la chiave non finisce né in git né nell'immagine Docker, in Docker viene montata come secret (vedi sotto). Chi ha la chiave può modificare i calendari condivisi con il service account.

6. **Condividi il calendario** (consiglio: un calendario dedicato, es. "UniBG", creato da te in Google Calendar):
   - Google Calendar sul web → accanto al calendario ⋮ → **Impostazioni e condivisione**;
   - **Condividi con persone specifiche o gruppi → Aggiungi persone e gruppi**;
   - incolla l'email del service account: è il campo `client_email` del JSON (`unibg-sync@<progetto>.iam.gserviceaccount.com`), la trovi anche nella dashboard dell'app;
   - permesso **Apportare modifiche agli eventi** → _Invia_.
7. **Trova l'ID del calendario**: nella stessa pagina, sezione **Integra calendario → ID calendario** (es. `abc123…@group.calendar.google.com`; per il calendario principale è il tuo indirizzo Gmail). Lo incollerai nel wizard.

Scope usati: `calendar.events` (eventi) e `calendar.calendarlist` (serve a `calendarList.insert`/`list` per aggiungere il calendario condiviso alla lista del service account; con il solo `calendar.events` quelle chiamate verrebbero rifiutate). Gli eventi non hanno mai `attendees`: un service account non può invitare persone senza delega a livello di dominio.

**Rotazione della chiave**: crea una nuova chiave, sostituisci il file, riavvia web e worker, poi elimina la vecchia chiave dalla console. Se Google rifiuta la chiave (eliminata o disattivata) la sincronizzazione va in pausa, la dashboard lo segnala e riprende da sola appena le credenziali tornano valide (oppure premi "Verifica credenziali").

## 2. Configurazione

```bash
cp .env.example .env
openssl rand -base64 48   # → SESSION_SECRET
openssl rand -hex 24      # → CRON_SECRET
```

- `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./secrets/google-service-account.json` (in alternativa `GOOGLE_SERVICE_ACCOUNT_JSON` con tutto il JSON su una riga, grezzo o in base64).
- `APP_PASSWORD`: la password della UI. Può essere in chiaro (all'avvio viene hashata con bcrypt, solo in memoria) oppure già un hash bcrypt. Per l'hash usa `pnpm hash-password`: il carattere `$` va scritto `\$` nel `.env` letto da `pnpm dev`, mentre per Docker Compose va racchiuso tra apici singoli; lo script stampa entrambe le forme. Cambiando la password tutte le sessioni aperte scadono.

Il `.env` e la chiave vengono validati all'avvio: se manca qualcosa il server e il worker si fermano con l'elenco dei problemi.

## 3. Avvio in sviluppo

```bash
pnpm install
pnpm dev       # http://localhost:3000
pnpm worker    # in un secondo terminale: sync ogni 15 minuti + refresh catalogo alle 06:00
```

Il database SQLite è in `data/unibg.db` (migrazioni applicate in automatico all'avvio).

## 4. Docker

```bash
docker compose up -d --build
```

- due servizi, `web` (porta 3000) e `worker`, con lo stesso volume `unibg-data` montato su `/data`;
- la chiave è un **secret** Compose: `./secrets/google-service-account.json` viene montato in sola lettura su `/run/secrets/google_service_account` e `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` punta lì. I container girano come utente `node` (uid 1000): se il tuo utente sull'host non ha uid 1000, rendi il file leggibile a quell'uid (`sudo chown 1000 secrets/google-service-account.json`);
- `restart: unless-stopped`, healthcheck su `/api/health` (web) e sul battito del worker;
- in Docker `DATABASE_URL` è forzato a `file:/data/unibg.db`.

Se esponi l'app su Internet mettila dietro un reverse proxy HTTPS che imposti `X-Forwarded-Proto: https`: il cookie di sessione diventa `Secure`. Il login ha un limite di tentativi (5 errori in 15 minuti per IP, 20 in totale).

### Cron esterno (alternativa al worker)

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://tuo-dominio/api/sync
```

Worker, `/api/sync` e "Sincronizza ora" condividono un lock nel DB: non partono mai due sincronizzazioni insieme.

## 5. Uso

1. Apri l'app ed entra con `APP_PASSWORD`.
2. **Nuova configurazione** → segui il wizard. L'iniziale del cognome preseleziona i gruppi di esercitazione ("A-L", "M-Z", "P-Z"…); se più gruppi sono compatibili (es. R → M-Z e P-Z) li seleziona tutti e mostra un avviso.
3. Al passo **Calendario** incolla l'ID del calendario condiviso e premi **Aggiungi e verifica**: l'app lo aggiunge alla lista del service account e fa una scrittura di prova (un evento invisibile del 1° gennaio 2000, creato e cancellato subito). La tendina mostra i calendari già aggiunti.
4. All'ultimo passo **Anteprima delle azioni** mostra cosa verrà scritto; **Salva e attiva** fa il primo sync (circa 100–200 eventi, con barra di avanzamento).
5. Da lì in poi ci pensa il worker. Nella dashboard trovi il registro, per esempio:
   - `FISICA I – ven 16/10 09:00: aula D001 → B201`
   - `Analisi matematica I exe b – ven 16/10 10:30: annullata`
   - `Nuova lezione: FONDAMENTI DI PROGRAMMAZIONE – mar 20/10 14:00`

Prima di ogni sincronizzazione l'app controlla che il calendario sia ancora condiviso in scrittura. Se togli la condivisione, la configurazione passa in "Errore" senza tentare scritture, e riparte da sola quando lo ricondividi.

Prova senza Google (legge l'orario reale e stampa le azioni del primo sync):

```bash
pnpm dry-run                                             # 21-R, PDS0-2012|1
pnpm dry-run -- --course 21-R --curriculum "PDS0-2012|1" --initial R --all
```

## 6. Come funziona la sincronizzazione

- **Fonte**: `grid_call.php` con `all_events=1` e `date = oggi`. Verificato: restituisce il periodo didattico che contiene la data **più tutti i periodi successivi già pubblicati** (se la data è oltre l'ultimo periodo, l'intero anno). Una sola chiamata per giro, quindi il semestre successivo compare da solo appena UniBG lo pubblica.
- **Identità**: ogni lezione è identificata dall'`id` EasyStaff. ID evento Google deterministico: `unibg<configId>s<id>` (solo caratteri base32hex; la `x` non è ammessa da Google).
- **Modifiche**: cambio di orario/aula/docente/note → evento aggiornato. Lezione annullata → `❌ ANNULLATA – …`, rossa, "libero" (non cancellata). Lezione sparita dall'orario → `⚠️ RIMOSSA – …`, grigia; se ricompare con un `id` nuovo nella stessa settimana, stessa durata e stesso insegnamento viene trattata come spostamento. Le lezioni passate non vengono mai toccate.
- **Protezioni**: se il portale non risponde, la risposta non passa la validazione (Zod), arriva vuota o le lezioni future calano di oltre il 30%, non viene applicato nulla e si riprova al giro dopo. Dopo 3 anomalie consecutive compare un avviso; da "Sincronizza ora" puoi forzare l'applicazione.
- **Idempotenza**: due giri senza cambiamenti fanno zero scritture su Google. Se cambi le opzioni (titolo, promemoria, colore) gli eventi futuri vengono riscritti una sola volta.
- **Nuovi insegnamenti** che compaiono nei tuoi anni/percorsi non vengono sincronizzati finché non li approvi dalla dashboard. Insegnamenti selezionati in anticipo per un semestre non ancora pubblicato partono da soli appena hanno lezioni.

## 7. Cambio semestre e nuovo anno accademico

- **Cambio semestre**: automatico. Quando il secondo semestre viene pubblicato, la stessa chiamata lo include; nel registro compare "Pubblicato l'orario: …" (refresh del catalogo alle 06:00).
- **Nuovo A.A.**: ogni mattina il worker ricarica l'elenco degli anni. Quando compare (es. 2027/28) la dashboard mostra "È disponibile l'A.A. 2027/2028": crea una **nuova configurazione** (anno di corso e percorso cambiano). Quando l'anno vecchio è finito puoi usare "Disattiva e rimuovi eventi" sulla vecchia configurazione, oppure lasciarla in pausa per conservare gli eventi passati.

## Sviluppo

```bash
pnpm typecheck   # next typegen + tsc
pnpm lint
pnpm test        # Vitest, usa le risposte reali in fixtures/
pnpm db:generate # dopo aver modificato lib/db/schema.ts
```

Struttura: `lib/easystaff` (client, parser, schemi Zod, normalizzazione), `lib/sync` (diff puro, safety check, piano, `runSync`), `lib/google` (service account, calendari, upsert), `lib/db` (Drizzle), `worker/`, `components/<feature>`, `app/` (pagine sottili). Dettagli e verifiche fatte sul portale: [docs/PIANO.md](docs/PIANO.md).
