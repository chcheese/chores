# Chores – Haushaltsaufgaben

Selbstgehostete App, die an wiederkehrende Haushaltsaufgaben erinnert: Betten beziehen, saugen, Bad putzen, Geschirrspüler-Sieb, entkalken usw. Läuft als einzelner Docker-Container mit Web-App (PWA, aufs Handy installierbar) und REST-API. Eine Home-Assistant-Integration (HACS) bringt die Aufgaben als To-do-Liste, Sensoren und Services nach Home Assistant.

*Self-hosted household chores tracker (German UI) with a REST API and a Home Assistant integration.*

```
[Chores-Container: Fastify-API + SQLite + Web-UI (PWA)]
        ├── Home Assistant (custom_components/chores, via HACS)
        └── MagicMirror²-Modul               (geplant)
```

Die App ist die einzige Quelle der Wahrheit. Home Assistant ist nur ein Client.

## Funktionen

- **Zwei Rhythmus-Arten**
  - *Nach Erledigung*: X Tage/Wochen/Monate nach der letzten Erledigung (z.B. Betten alle 14 Tage).
  - *Fester Rhythmus*: feste Termine ab einem Startdatum (alle 3 Monate, jeden Samstag, jeden 1. im Monat, Monatsletzter). Intern RRULE.
- **Status** `ok` → `fällig` → `überfällig` (nach einstellbarer Toleranz, Standard 2 Tage). Alle Daten sind Kalendertage in Europe/Zurich. Monatsenden werden korrekt gekürzt (31. Jan. + 1 Monat = 28./29. Feb.).
- **Erledigen, Verschieben, Überspringen**, jeweils mit *Rückgängig*.
- **Zuweisung**: alle, feste Person oder abwechselnd (Rotation).
- **Zähler**: z.B. «alle 30 Spülgänge». Home Assistant zählt mit, die Aufgabe wird fällig, sobald der Zähler erreicht ist (oder das Datum, je nachdem, was zuerst eintritt).
- **Saison**: Aufgaben wie «Rasen mähen» gelten nur in bestimmten Monaten (z.B. April–Oktober). Ausserhalb der Saison ruhen sie und werden zum Saisonstart wieder fällig. Feste Rhythmen bleiben dabei auf ihren Wochentagen.
- **Ferienmodus**: Während der Ferien ist nichts fällig. Danach verschieben sich Aufgaben «nach Erledigung» um die Ferientage, feste Termine in den Ferien entfallen. Lässt sich planen oder vorzeitig beenden.
- **Zustandsbalken**: Jede Aufgabe zeigt, wie «frisch» sie ist – voll und grün direkt nach dem Erledigen, leer und rot am Fälligkeitstag. Die Ansicht «Bereiche» fasst das pro Raum zusammen.
- **Dauer**: geschätzte Minuten pro Aufgabe, Filter «⚡ Kurz» (bis 15 Min.) und Zeitschätzung für alles Fällige.
- **Punkte & Belohnungen**: Wer etwas erledigt, sammelt Punkte. Erwachsene legen Belohnungen an (Glace, Bildschirmzeit …), Kinder lösen sie ein, ein Erwachsener gibt frei (in der App oder per Home Assistant). Dazu Level, Serien («Tage in Folge») und zehn Abzeichen.
- **Login** per Avatar + PIN, Rollen *Admin*, *Erwachsen*, *Kind*. API-Tokens für Home Assistant, MagicMirror & Co.
- **Vorlage-Katalog**: 15 Haushaltsaufgaben und 14 für Haus & Garten (Rasen, Hecke, Laub, Dachrinne, Aussenwasser, Heizung entlüften, Reifenwechsel, Lüftungsfilter, Enthärtungssalz …) mit Dauer und Saison. Beim Übernehmen werden die ersten Fälligkeiten über zwei Wochen verteilt.
- **OpenAPI-Doku** unter `/api/docs`.
- Hell/Dunkel, Deutsch (Schweizer Schreibweise), keine Cloud, keine externen Abhängigkeiten zur Laufzeit.

## Installation (Docker / Dockge)

```bash
git clone https://github.com/chcheese/chores.git
cd chores
mkdir -p data          # gehört dem Benutzer mit UID 1000 (Container läuft als 1000:1000)
docker compose up -d --build
```

Danach `http://<host>:3070` öffnen. Beim ersten Start legst du den Admin an und kannst die Vorlagen übernehmen.

In **Dockge** einen neuen Stack anlegen und den Inhalt von [`docker-compose.yml`](docker-compose.yml) verwenden (Build-Kontext = Repo-Ordner) oder das Repo direkt in den Stack-Ordner klonen.

| Variable | Standard | Bedeutung |
|---|---|---|
| `CHORES_PORT` | `3070` | Port auf dem Host |
| `APP_TZ` | `Europe/Zurich` | Zeitzone für «heute» und Fälligkeiten |
| `COOKIE_SECURE` | `false` | `true`, wenn die App über HTTPS läuft (z.B. hinter Nginx Proxy Manager) |
| `SESSION_DAYS` | `180` | Wie lange ein Login gültig bleibt |

**Daten & Backup:** alles liegt in `./data/chores.sqlite` (SQLite im WAL-Modus). Für ein konsistentes Backup den Container kurz stoppen oder `sqlite3 data/chores.sqlite ".backup backup.sqlite"` verwenden. Schema-Migrationen laufen beim Start automatisch.

## Home Assistant

### Installation über HACS

1. HACS → ⋮ → *Benutzerdefinierte Repositories* → `https://github.com/chcheese/chores`, Typ *Integration*.
2. «Chores (Haushaltsaufgaben)» installieren und Home Assistant neu starten.
3. In der Chores-App unter *Einstellungen → API-Tokens* ein Token erstellen.
4. *Einstellungen → Geräte & Dienste → Integration hinzufügen → Chores*: URL (z.B. `http://10.1.10.27:3070`) und Token eingeben.

Ohne HACS: den Ordner `custom_components/chores` nach `/config/custom_components/` kopieren.

### Entitäten

| Entität | Inhalt |
|---|---|
| `todo.haushalt` | Fällige und überfällige Aufgaben. Abhaken = in der App erledigen. |
| `sensor.haushalt_fallige_aufgaben` | Anzahl fällig + überfällig, Liste im Attribut `chores` |
| `sensor.haushalt_uberfallige_aufgaben` | Anzahl überfällig |
| `sensor.haushalt_<aufgabe>` | Nächste Fälligkeit (Datum) pro Aufgabe; Attribute `chore_id`, `status`, `assignee`, `duration_minutes`, `freshness`, `in_season`, Zähler … (abschaltbar in den Optionen) |
| `binary_sensor.haushalt_ferienmodus` | An, solange der Ferienmodus läuft; Attribute `start`, `until` |
| `sensor.haushalt_offene_wunsche` | Anzahl Belohnungswünsche, die auf Freigabe warten; Liste im Attribut `claims` |
| `sensor.haushalt_punkte_<name>` | Einlösbare Punkte pro Person; Attribute `level`, `streak`, `done_this_week`, `badges` |

Die Entitäts-IDs entstehen aus den Namen in der Sprache deiner HA-Installation. Englisch: `sensor.haushalt_due_chores`.

### Services

| Service | Felder |
|---|---|
| `chores.complete` | `chore_id`, optional `user_id`, `note` |
| `chores.skip` | `chore_id`, optional `note` |
| `chores.snooze` | `chore_id`, `days` |
| `chores.increment_counter` | `chore_id`, `by` (Standard 1) |
| `chores.approve_reward` / `chores.reject_reward` | `claim_id` |
| `chores.start_vacation` | `until`, optional `start` (Standard heute) |
| `chores.end_vacation` | – |

Die `chore_id` steht als Attribut auf jedem Aufgaben-Sensor. Alle Services können die aktualisierte Aufgabe als Antwort zurückgeben (`response_variable`).

### Events

- `chores_status_changed`: eine Aufgabe wechselt den Status (z.B. `due` → `overdue`). Daten: `chore_id`, `title`, `old_status`, `new_status`, `next_due`, `assignee`.
- `chores_reward_requested`: ein neuer Belohnungswunsch. Daten: `claim_id`, `reward`, `icon`, `cost`, `user_id`, `user`.

### Beispiel-Automationen

Morgens eine Push-Nachricht mit den fälligen Aufgaben:

```yaml
automation:
  - alias: Haushalt – Morgenübersicht
    triggers:
      - trigger: time
        at: "07:30:00"
    conditions:
      - condition: numeric_state
        entity_id: sensor.haushalt_fallige_aufgaben
        above: 0
    actions:
      - action: notify.mobile_app_handy
        data:
          title: "Haushalt: {{ states('sensor.haushalt_fallige_aufgaben') }} Aufgaben fällig"
          message: >
            {% for c in state_attr('sensor.haushalt_fallige_aufgaben', 'chores') %}
            {{ c.icon }} {{ c.title }}{% if c.status == 'overdue' %} (überfällig){% endif %}
            {% endfor %}
```

Saugroboter fertig → «Boden saugen» erledigen:

```yaml
  - alias: Haushalt – Saugroboter fertig
    triggers:
      - trigger: state
        entity_id: vacuum.roborock
        from: cleaning
        to: docked
    actions:
      - action: chores.complete
        data:
          chore_id: 2
          note: "Saugroboter"
```

Belohnungswunsch als Push mit «Ja/Nein»-Knöpfen:

```yaml
  - alias: Haushalt – Belohnungswunsch
    triggers:
      - trigger: event
        event_type: chores_reward_requested
    actions:
      - action: notify.mobile_app_handy
        data:
          title: "{{ trigger.event.data.user }} möchte {{ trigger.event.data.icon }} {{ trigger.event.data.reward }}"
          message: "{{ trigger.event.data.cost }} Punkte"
          data:
            actions:
              - action: "CHORES_APPROVE_{{ trigger.event.data.claim_id }}"
                title: Ja
              - action: "CHORES_REJECT_{{ trigger.event.data.claim_id }}"
                title: Nein
  - alias: Haushalt – Belohnung entscheiden
    triggers:
      - trigger: event
        event_type: mobile_app_notification_action
    conditions:
      - condition: template
        value_template: "{{ trigger.event.data.action.startswith('CHORES_') }}"
    actions:
      - action: >
          {{ 'chores.approve_reward' if trigger.event.data.action.startswith('CHORES_APPROVE_') else 'chores.reject_reward' }}
        data:
          claim_id: "{{ trigger.event.data.action.split('_')[-1] | int }}"
```

Geschirrspüler-Zyklen über einen Stromsensor zählen:

```yaml
  - alias: Haushalt – Spülgang zählen
    triggers:
      - trigger: numeric_state
        entity_id: sensor.geschirrspueler_leistung
        below: 3
        for: "00:05:00"
    conditions:
      - condition: template
        value_template: "{{ trigger.from_state.state | float(0) > 50 }}"
    actions:
      - action: chores.increment_counter
        data:
          chore_id: 6
```

## REST-API

Authentifizierung: `Authorization: Bearer <API-Token>` (oder das Session-Cookie der Web-App). Vollständige Doku mit Schemas unter `/api/docs`.

| Methode & Pfad | Zweck |
|---|---|
| `GET /api/chores` | Alle Aufgaben mit `status`, `daysUntilDue`, `assignee` |
| `GET /api/chores/due` | Nur fällige + überfällige (für HA / MagicMirror) |
| `POST /api/chores` · `PATCH`/`DELETE /api/chores/:id` | Verwalten (Erwachsene/Admin) |
| `POST /api/chores/:id/complete` | Erledigen (`user_id`, `note` optional) |
| `POST /api/chores/:id/snooze` | Verschieben (`days`) |
| `POST /api/chores/:id/skip` | Überspringen, ohne Punkte |
| `POST /api/chores/:id/counter` | Zähler erhöhen (`by`) |
| `GET /api/completions` · `DELETE /api/completions/:id` | Verlauf, letzten Eintrag rückgängig machen |
| `GET`/`PUT`/`DELETE /api/vacation` | Ferienmodus abfragen, planen, beenden |
| `GET`/`POST /api/rewards` · `POST /api/rewards/:id/claim` | Belohnungen, einlösen |
| `GET /api/claims` · `POST /api/claims/:id/approve` bzw. `/reject` | Wünsche, freigeben/ablehnen |
| `GET /api/progress` | Punkte, Level, Serien, Abzeichen pro Person |
| `GET /api/users` · `GET /api/templates` · `GET /api/health` | Personen, Vorlagen, Health-Check |

## Entwicklung

```bash
cd app && npm install
npm run dev:server      # API auf :3000 (tsx watch)
npm run dev:web         # Vite auf :5173, /api wird an :3000 weitergeleitet
npm test                # Vitest: Scheduling, API, Rollen, Migrationen
```

Schema ändern: `app/server/src/db/schema.ts` anpassen, dann `npm run db:generate -w server`. Neue Migrationen immer auch gegen eine Kopie einer echten Datenbank testen.

HA-Integration testen (Python 3.14):

```bash
pip install pytest-homeassistant-custom-component
pytest
```

## Roadmap

- Kinder-Ansicht für Tablet/Kiosk (grosse Icons)
- MagicMirror²-Modul `MMM-Chores` (liest `/api/chores/due`)
- Faire Verteilung: Zuweisung an die Person mit den wenigsten Punkten, Statistik pro Woche/Monat
- Teilschritte (Checklisten), einmalige Aufgaben, Kalender
- Optionale Benachrichtigungen direkt aus der App (ntfy/Pushover)

## Lizenz

[MIT](LICENSE)
