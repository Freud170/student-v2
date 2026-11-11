# Student

Appserver mit Hono zur Verwaltung von Studierendendaten (Aufgabe 3 im Modul
Software Engineering, Hochschule Karlsruhe).

Fachlich entspricht das Projekt unserer Aufgabe 1 (`student`, FastAPI).
Die Umsetzung verwendet TypeScript, Hono und Drizzle.

## Überblick (geplant)

| Bereich | Technik |
|---|---|
| Sprache, Projekt | TypeScript, Node, pnpm |
| Web | Hono mit REST und GraphQL (GraphQL Yoga), Validierung mit Zod |
| Datenbank | PostgreSQL, OR-Mapping mit Drizzle |
| Security | Keycloak (OIDC/OAuth 2), HTTPS, Security-Header |
| Tests | Vitest mit Fetch API, Bruno, Grafana k6 |
| Qualität | Oxlint, Oxfmt, GitHub Actions, SonarQube, OWASP Dependency Check |
| Betrieb, Doku | Pino, Docker und Docker Compose, AsciiDoctor mit PlantUML |

## Datenmodell

- **Student:** id, version, matrikelnummer (6-stellig, eindeutig), nachname, vorname,
  email (eindeutig), username, erzeugt, aktualisiert
- **Adresse** (1:1): plz, ort
- **Prüfungsleistung** (1:N): modul, note (nur zulässige Notenstufen), semester

Rollen: `admin` und `student`.

## Schnellstart

Voraussetzungen: Node `^26.13.0` und
pnpm `^12.19.0` (jeweils innerhalb derselben Hauptversion). Eine unpassende
pnpm-Version führt zum Abbruch, siehe `pmOnFail` in `pnpm-workspace.yaml`.

```powershell
pnpm install
pnpm run dev       # HTTPS unter https://localhost:3000 mit Watch-Modus
# Alternativ: pnpm start ohne Watch-Modus; beenden mit Strg+C
```

`pnpm run hello` bleibt als Alias fuer den Watch-Modus verfuegbar. Vor dem Start
muss Port 3000 frei sein, insbesondere darf dort nicht bereits die Anwendung aus
der ersten Abgabe laufen. Beim Start werden die DB-Passwortdatei und das
oeffentliche DB-Zertifikat aus `[db]` gelesen und der Verbindungspool erzeugt.
Verbindungen entstehen erst bei einer DB-Abfrage, beispielsweise durch Readiness.
Greeting und Liveness benoetigen keine DB-Verbindung. Keycloak wird noch nicht
benoetigt; der Start laedt keine Daten oder Benutzer nach.

Der Server läuft nur mit HTTPS (HTTP/2 und TLS 1.3, zusätzlich HTTP/1.1 für Bruno).
Zertifikat und privater Schlüssel liegen in `src/config/tls/`. Das Zertifikat ist
selbstsigniert (Browser-Warnung in der Entwicklung bestätigen), der private Schlüssel
liegt deshalb bewusst im Repository.

## Datenbank

PostgreSQL 19rc1 läuft als Docker-Container mit TLS (Datenbank, DB-User und Schema
`student`, eigene Volumes `*_student_v2`). Die einmalige Einrichtung steht in
[extras/compose/postgres/ReadMe.md](extras/compose/postgres/ReadMe.md), danach:

```powershell
cd extras\compose\postgres
docker compose up -d      # starten; beenden mit docker compose down
```

Die Anwendung stellt einen Drizzle-Client im DI-Container bereit; Readiness
prueft damit die Datenbankverbindung. Die Tabellendefinitionen
liegen in `extras/compose/postgres/init/student/sql/create-table.sql` und setzen
das eingerichtete Schema `student` sowie den Tablespace `studentspace` voraus.
Das Skript legt die Tabellen `student`, `adresse` und `pruefungsleistung` mit
Constraints und Indizes an. IDs werden ab 1000 generiert; die Version beginnt
bei 0. Matrikelnummer und E-Mail sind eindeutig, Matrikelnummer und PLZ werden
auf ihr Ziffernformat geprueft, Noten auf die zulaessigen Notenstufen.
Die Fremdschluessel loeschen Adresse und Pruefungsleistungen beim Loeschen eines
Studierenden mit. Ein eindeutiger Fremdschluessel begrenzt die Adresse auf
hoechstens eine pro Student; die Existenz einer Adresse erzwingt er nicht.

Das Skript wird nicht beim App-Start ausgefuehrt. `IF NOT EXISTS` legt fehlende
Tabellen und Indizes an, gleicht aber bestehende Definitionen nicht ab und ersetzt
keine Migration.

Unter `extras/compose/postgres/init/student/csv` liegen 5 Studierende,
5 Adressen und 6 Pruefungsleistungen als CSV-Testdaten. `sql/copy-csv.sql` im
benachbarten SQL-Verzeichnis importiert sie in dieser Reihenfolge mit expliziten
Spaltenlisten. Die festen IDs liegen unter 1000 und kollidieren deshalb nicht
mit den ab 1000 generierten IDs. Der Import setzt leere Tabellen voraus und wird
mit Fehlerabbruch in einer gemeinsamen Transaktion ausgefuehrt; die Befehle
stehen in der PostgreSQL-Anleitung. Er legt keine Keycloak-Benutzer an.
Zum wiederholbaren Neuladen werden `sql/reset-data.sql` und `sql/copy-csv.sql`
gemeinsam in einer Transaktion aufgerufen. Dabei werden ausschliesslich die drei
Studierendentabellen geleert und ihre Identity-Sequenzen zurueckgesetzt.
Der Ablauf ist gegen PostgreSQL 19rc1 geprueft: zwei Neuladevorgaenge liefern
denselben Datenbestand und Sequenzstand. Ein absichtlich fehlerhafter Import
laesst den vorherigen Bestand einschliesslich Sequenzen unveraendert.
Der Aufruf erfolgt manuell in der getrennten Testdatenbank; die Anleitung steht
unter [Testdaten neu laden](extras/compose/postgres/ReadMe.md#testdaten-wiederholbar-neu-laden).

## Anwendungsbasis

### Drizzle-Schema

`src/db/schema.mts` bildet die bestehenden Tabellen im Schema `student` mit
Drizzle ab. Spaltentypen, Pflichtfelder, Identity-Start bei 1000, Version 0,
Constraints, Indizes und Loeschkaskaden entsprechen der vorhandenen Datenbank.
Die Zeitstempel haben weiterhin keinen Default. `numeric(2,1)` wird als String
gelesen, die Zeitstempel als `Date`; Matrikelnummer und PLZ bleiben Strings.
`src/db/relations.mts` beschreibt die Beziehungen in beiden Richtungen:
hoechstens eine Adresse und beliebig viele Pruefungsleistungen pro Student.

Das Mapping wurde mit `drizzle-kit pull` aus der laufenden Datenbank abgeleitet
und als `.mts` aufbereitet. Drizzle Kit verwendet `drizzle.config.ts` und
`DATABASE_URL` aus der Umgebung oder einer lokal ignorierten `.env`.
Die generierten Rohdateien unter `drizzle/` bleiben lokal und sind ignoriert;
versioniert werden die aufbereiteten Module unter `src/db/`.

Zur erstmaligen Ableitung in einem frischen Checkout ohne lokales `drizzle/`
im Projektverzeichnis zuerst Container und Volumes gemaess
der [PostgreSQL-Anleitung](extras/compose/postgres/ReadMe.md) pruefen. Das lokale
oeffentliche Zertifikat muss dem Serverzertifikat entsprechen. Danach:

```powershell
$dbPassword = (Get-Content extras/compose/postgres/password.txt -Raw).Trim()
$certPath = (Resolve-Path extras/compose/postgres/init/tls/server.crt).Path
$previousDatabaseUrl = $env:DATABASE_URL
try {
    $env:DATABASE_URL = 'postgresql://student:' + [Uri]::EscapeDataString($dbPassword) + '@localhost:5432/student?schema=student&sslmode=verify-full&sslrootcert=' + [Uri]::EscapeDataString($certPath) + '&options=' + [Uri]::EscapeDataString('-c default_transaction_read_only=on')
    pnpm exec drizzle-kit pull --output json
    # Nur nach erfolgreichem Pull: Mapping gegen den lokalen DB-Snapshot pruefen.
    # Erwartet: status "no_changes".
    if ($LASTEXITCODE -eq 0) {
        pnpm exec drizzle-kit generate --explain --output json
    }
} finally {
    $env:DATABASE_URL = $previousDatabaseUrl
    $dbPassword = $null
}
```

Der Pull liest die Datenbank und schreibt ausschliesslich lokale Dateien.
`generate --explain` vergleicht das Mapping mit dem lokalen Snapshot, ohne eine
Migration anzuwenden. Die Verbindung verwendet Zertifikats- und Hostnamenpruefung
sowie ausschliesslich lesende Transaktionen. Es wird kein `push`, `migrate` oder
`pull --init` ausgefuehrt. Tabellen werden weiterhin ueber die vorhandenen
SQL-Skripte verwaltet; ein Migrationsverfahren ist noch nicht eingerichtet.

Geprueft sind Schema-Uebereinstimmung und lesende Drizzle-Abfragen ueber TLS 1.3:
5 Studierende, 5 Adressen, 6 Pruefungsleistungen, Beziehungen in beiden Richtungen,
Studierende ohne/mit mehreren Leistungen sowie die String-/Date-Abbildung.
Das war eine manuelle Integrationspruefung; Vitest bleibt ohne Datenbankzugriff.
Der Drizzle-Client der Anwendung verwendet dieses Mapping. Das Repository liest
vollstaendige Aggregate per ID oder mit kombinierbaren Suchfiltern.

### DB-Konfiguration und Verbindungspool

`[db]` in `src/config/config.toml` wird mit Zod validiert. `src/config/db.mts`
erzeugt einen `pg`-Pool und einen Drizzle-Client; beide leben so lange wie die
Anwendung. Die DB-Abhaengigkeit wird explizit an `createContainer` uebergeben.
Das Importieren der Module erzeugt keine Verbindung.

| Einstellung | Default / Bedeutung |
|---|---|
| `host`, `port` | `localhost`, `5432` |
| `database`, `user` | jeweils `student` |
| `passwordFile` | `extras/compose/postgres/password.txt`; Inhalt wird lokal gelesen |
| `caFile` | `extras/compose/postgres/init/tls/server.crt`; Vertrauensanker fuer den DB-Server |
| `poolMax` | 5 Verbindungen, erlaubt: 1 bis 100 |
| `poolIdleTimeoutMillis` | 30000 ms; unbenutzte Verbindungen freigeben |
| `poolConnectionTimeoutMillis` | 5000 ms; Verbindungsaufbau begrenzen |
| `queryTimeoutMillis` | 5000 ms; clientseitige Wartezeit auf Abfragen begrenzen |

Alle drei Timeouts muessen zwischen 1 und 60000 ms liegen. Pool-Wartezeit bzw.
Verbindungsaufbau und anschliessende Abfrage haben getrennte Zeitgrenzen;
ihre Dauer kann sich addieren. Explizite relative
Dateipfade gelten ab dem Projektverzeichnis. Ohne Pfadangabe werden die
entsprechenden Dateien relativ zum Konfigurationsmodul aufgeloest.
Fehlende Dateien oder eine leere Passwortdatei verhindern den Start.
Die Verbindung verwendet direkte TLS-Aushandlung mit PostgreSQL, ausschliesslich
TLS 1.3 und aktivierter Zertifikats- und Hostnamenpruefung. Das CA-Zertifikat muss
zum laufenden Server passen; es wird kein privater DB-Schluessel benoetigt.
SQL-Abfragen und Parameter werden nicht automatisch geloggt. Fehler unbenutzter
Poolverbindungen werden ohne interne Fehlerdetails protokolliert.

`src/server.mts` startet HTTPS und verwaltet den Shutdown. Bei `Strg+C` (`SIGINT`)
oder `SIGTERM` nimmt der Server keine neuen Verbindungen mehr an, laesst laufende
HTTP-Anfragen und HTTP/2-Sessions auslaufen und schliesst danach den Pool.
Mehrfaches Schliessen verwendet denselben Abschlussvorgang. Auch ein
fehlgeschlagener HTTPS-Start gibt den Pool frei.

Manuell geprueft: TLS 1.3 mit dem DB-User `student`, Wiederverwendung einer
Verbindung, Bestand 5/5/6, Pool-Schliessen, Ablehnung eines fremden CA-Zertifikats
und Fehler bei nicht erreichbarer DB. HTTPS wurde mit HTTP/1.1-Keep-Alive und
HTTP/2 einschliesslich Shutdown und anschliessend geschlossenem Pool geprueft.

### App und Router

`StudentRepository.findById(id)` in `src/student/repository/` laedt einen
Studierenden mit Adresse und allen Pruefungsleistungen in einer parametrisierten
SQL-Abfrage. Zwei LEFT JOINs erhalten Studierende ohne Leistungen oder Adresse.
Die Rueckgabe entspricht dem Typ `Student` unter `src/student/entity/`:
fehlende Adresse als `null`, fehlende Leistungen als leeres Array,
unbekannte ID als `undefined`. DB-Fehler werden weitergegeben.
Pruefungsleistungen sind aufsteigend nach ID geordnet. Die Abfrage verwendet
kein LIMIT auf Join-Zeilen, damit mehrere Leistungen vollstaendig bleiben.
Noten bleiben dezimale Strings, Zeitstempel `Date`-Werte.

`StudentRepository.find(params)` verwendet dieselben Fetch-Joins und verbindet
alle angegebenen Filter mit AND. Ohne Filter liefert die Suche alle Studierenden,
bei fehlenden Treffern ein leeres Array. Studierende und Leistungen sind jeweils
nach ID geordnet. Pagination ist noch nicht eingerichtet.

| Suchparameter | Vergleich |
|---|---|
| `nachname`, `vorname`, `ort` | Teiltext ohne Unterscheidung von Gross-/Kleinschreibung |
| `matrikelnummer` | Exakt, sechs Ziffern |
| `email` | Exakt, einschliesslich Gross-/Kleinschreibung |
| `plz` | Exakt, fuenf Ziffern |

Alle Werte werden als SQL-Parameter gebunden; `%`, `_` und Backslashes gelten
auch bei Teiltextsuche als woertliche Zeichen. Der DI-Container injiziert die
gemeinsame Repository-Instanz in `StudentService`. Dessen `find` validiert mit Zod,
entfernt umgebende Leerzeichen und weist leere Werte sowie unbekannte Parameter
ab. `findById` akzeptiert positive Ganzzahlen im PostgreSQL-Integerbereich.
Suchwerte werden nicht geloggt; DB-Fehler werden weitergegeben.

Manuell gegen PostgreSQL ueber TLS 1.3 geprueft: alle fuenf Teststudierenden mit
null, einer und zwei Leistungen, unbekannte ID, alle sechs Filter, AND-Kombinationen,
woertliche Sonderzeichen und fehlende Treffer. Die Pruefsummen aller drei Tabellen
waren vor und nach der Pruefung identisch. Fehlende Adressen sind durch lokale
Tests mit simulierten Treiberzeilen abgedeckt.

`src/index.mts` liest die Konfiguration, erzeugt einmal den DI-Container und startet
den HTTPS-Server. `src/app.mts` setzt die Router und Middleware zusammen und kann
ohne Serverstart getestet werden. Der Container haelt einen gemeinsamen Pino-Logger
und eine `StudentService`-Instanz sowie den gemeinsamen Drizzle-Client mit Pool
fuer die Anwendung. Abhaengigkeiten
werden explizit an die Router und Services uebergeben.

| Route | Verhalten |
|---|---|
| `GET /` | Bestehendes `{"msg":"Hello World"}` |
| `GET /rest` | `{"msg":"Hello Student"}` aus dem injizierten Student-Service |
| `GET /health/liveness` | Status 200 mit `{"status":"up"}` |
| `GET /health/readiness` | `SELECT 1` erfolgreich: 200 mit `{"status":"up"}`; DB-Fehler: 503 mit `{"status":"down"}` |
| `HEAD /`, `HEAD /rest` | Dieselben Statuscodes und Header, ohne Response-Body |
| `HEAD /health/liveness`, `HEAD /health/readiness` | Dieselbe Pruefung und derselbe Status wie GET, ohne Response-Body |
| Unbekannte Route | JSON mit Status 404 |

`/rest` ist der Einstieg fuer die spaetere Studierenden-API, noch keine Suche und
keine Liste von Studierenden. Lesende REST-Routen (#20), Schreibrouter, GraphQL und
Keycloak-Anbindung folgen mit den jeweiligen Funktionen. `Student` bleibt das
zentrale Aggregate mit Adresse (1:1) und Pruefungsleistungen (1:N).

Die Health-Endpunkte liegen in einem eigenen Router unter `src/admin/` und
durchlaufen dieselbe globale Middleware wie die anderen Routen. Liveness zeigt,
dass die Anwendung Requests unabhaengig von der Datenbank beantworten kann.
Readiness fuehrt bei jedem Aufruf `SELECT 1` ueber denselben Pool wie das Repository
aus. Bei einem Fehler werden keine internen DB-Details ausgegeben oder geloggt;
der naechste Aufruf prueft erneut. Geprueft wird die Datenbankverbindung, nicht
der Zustand des Schemas oder Keycloak. Erreichbare DB, geschlossener Pool und
unabhaengige Liveness wurden manuell geprueft; ebenso Abfrage-Timeout und
anschliessende Wiederverwendbarkeit des Pools.

Globale Middleware setzt Security-Header (u.a. HSTS und `nosniff`), CORS und
Antwortkompression mit `hono/compress`. Die erlaubten Browser-Origins stehen in
`[cors].origins` in `src/config/config.toml`; aktuell sind nur `GET` und `HEAD`
freigegeben. Preflights erhalten Status 204. Nicht freigegebene Origins erhalten
keinen `Access-Control-Allow-Origin`-Header; CORS ersetzt keine Authentifizierung.
Die Hono-Optionen heissen `allowHeaders` und `exposeHeaders`.

Antworten werden bei passendem `Accept-Encoding` mit gzip oder deflate komprimiert.
`hono/compress` komprimiert keine eingehenden Request-Bodies. Die entsprechende
Anforderung wird im offenen Issue #41 weitergefuehrt; fuer die spaeteren
Schreibendpunkte muss die Behandlung komprimierter Requests festgelegt werden.

`X-Response-Time` misst die Bearbeitungszeit bis zur fertigen Response, ohne die
anschliessende Netzwerkuebertragung. Fehler und Preflights werden ebenfalls
protokolliert. Unerwartete Fehler liefern eine allgemeine JSON-Antwort mit Status
500; die fachlichen Fehlerfaelle aus Issue #22 folgen mit den REST-Funktionen.

## Logging

Pino wird ueber `[log]` in `src/config/config.toml` konfiguriert:

| Einstellung | Bedeutung |
|---|---|
| `level` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` oder `silent` |
| `output` | `console`, `file` oder `both` |
| `dir`, `file` | Verzeichnis und Name der JSON-Logdatei; relative Pfade gelten ab dem Arbeitsverzeichnis |
| `pretty` | Lesbare Konsolenausgabe; Dateien bleiben JSON |

Voreingestellt sind `info`, `both`, `log/server.log` und eine lesbare Konsole.
Das Logverzeichnis wird bei Bedarf angelegt und ist in Git ignoriert. Pro Request
werden Methode, Pfad ohne Query und Status auf `info` ausgegeben; die Antwortzeit
wird auf `debug` protokolliert und unabhaengig vom Loglevel als Header geliefert.
Request-Bodies, Query-Werte, Cookies und Authorization-Header werden nicht geloggt.

## Formatierung und Codeanalyse

```powershell
pnpm run fmt          # Formatieren mit Oxfmt (fmt:check prüft nur)
pnpm run lint         # Codeanalyse mit Oxlint (lint:fix korrigiert, was geht)
pnpm run typecheck    # TypeScript-Pruefung ohne Ausgabe von Build-Dateien
pnpm run test:run     # Vitest einmalig; pnpm test fuer den Watch-Modus
```

Die Tests pruefen App-Komposition, Health-Endpunkte, Middleware, Konfiguration,
Pino-Ausgabe sowie DB-Pool-Konfiguration, Server-Lebenszyklus, Service und Repository.
Sie verwenden keine laufenden Server und keine Datenbank-Fixtures. Die Pino-Tests
starten eigene Node-Prozesse, pruefen deren Ausgabe und entfernen ihre temporaeren
Logverzeichnisse unter `temp`. Pool- und Server-Lebenszyklustests simulieren
externe Ressourcen; sie oeffnen weder einen DB-Zugang noch einen HTTP-Port.
Die Repository-Tests ersetzen nur den PostgreSQL-Treiber; SQL-Erzeugung und
Ergebnisabbildung laufen mit Drizzle. Sie pruefen Aggregate, Parametrisierung,
LEFT JOINs ohne LIMIT, alle Suchfilter und die Weitergabe von DB-Fehlern.
Service-Tests pruefen Validierung vor dem DB-Zugriff; Health-Tests pruefen
DB-Ausfall und Erholung sowie die unabhaengige Liveness.
Automatisierte Tests gegen PostgreSQL/Keycloak, Bruno und Lasttests
sind noch nicht eingerichtet.

Die Regeln für Oxlint stehen in `oxlint.config.mts`; alle Kategorien sind als
Fehler eingestellt, inklusive Typprüfung.

**SonarQube** läuft als Docker-Container (Daten unter `C:\Zimmermann\volumes\sonarqube`,
Scanner unter `C:\Zimmermann\sonar-scanner`):

```powershell
cd extras\compose\sonarqube
docker compose up       # Server unter http://localhost:9000
```

Beim ersten Start mit `admin`/`admin` einloggen und das Passwort ändern. Unter
*My Account > Security* einen *Global Analysis Token* erzeugen und als
Umgebungsvariable speichern (der Token gehört nicht ins Repo):

```powershell
[Environment]::SetEnvironmentVariable("SONAR_TOKEN", "<Token>", "User")
pnpm run sonar            # in einer zweiten PowerShell, nach Neustart von Terminal bzw. VS Code
```

Das Ergebnis steht danach unter <http://localhost:9000>. Beenden mit `docker compose down`.

## Abhängigkeiten und Sicherheitslücken

```powershell
pnpm outdated              # neuere Versionen der Pakete aus package.json
pnpm audit --prod          # Sicherheitslücken in den dependencies (ohne devDependencies)
pnpm run dependency-check  # OWASP Dependency Check, Ergebnis in dependency-check-report.html
```

OWASP Dependency Check liegt unter `C:\Zimmermann\dependency-check` und gleicht die
Pakete mit der CVE-Datenbank der NIST ab. Dafür braucht man einen eigenen API-Key
(<https://nvd.nist.gov/developers/request-an-api-key>), der als Umgebungsvariable
gespeichert wird und nicht ins Repo gehört:

```powershell
[Environment]::SetEnvironmentVariable("NVD_API_KEY", "<Key>", "User")
```

Bewusst ignorierte Fehlalarme stehen mit Begründung in
`scripts/dependency-check-suppression.xml`.

Als ergaenzendes Sicherheitspaket zum Drizzle-Feature (#19) wird
`minimatch` fuer `eslint@10.14.0` und `@eslint/config-array@0.23.5` gezielt auf
`11.0.1` festgelegt. Die Overrides in `pnpm-workspace.yaml` beheben
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) in der
Entwicklungsabhaengigkeit; die Elternpakete verlangen noch Version 10.
Da dies deren Versionsbereich ueberschreitet, wurden rekursive Dateisuche,
Brace-/Extglob-Muster, partielle Pfadtreffer, Ignore-Muster und die
Regelausfuehrung mit ESLint gesondert geprueft. Alle vier Projektchecks bestehen
mit inzwischen 90 Tests; `pnpm audit` und `pnpm audit --prod` melden keine bekannten Luecken.
Bei einem Update der beiden Elternpakete muessen die Overrides erneut geprueft
und entfernt werden, sobald deren regulaere Abhaengigkeiten den Fix enthalten.

Die Warnung „No lock file exists … run `npm install --package-lock`“ kann ignoriert
werden: Sie kommt vom Node Package Analyzer, der nur `package-lock.json` von npm
liest. Unser `pnpm-lock.yaml` wertet der Pnpm Audit Analyzer aus. Dafür übergibt das
Skript den Pfad zu `pnpm.cmd` aus `PNPM_HOME`, weil Dependency Check pnpm unter
Windows nicht selbst findet.

## Entwicklung mit Git

Jedes Feature wird auf einem eigenen Branch von einem aktuellen `main` entwickelt.
Die kleinen Commit-Pakete desselben Features bleiben auf diesem Branch. Erst nach
vollstaendiger Umsetzung, Commits und erfolgreichen Pruefungen wird nach `main`
gemergt.
Commit-Messages auf Englisch nach [Conventional Commits](https://www.conventionalcommits.org)
(`feat:`, `fix:`, `docs:`, `chore:` …).

## Stand

Die Hono-Anwendungsbasis mit HTTPS, Router-/Service-Trennung, manueller DI,
Pino-Logging, Antwortzeit, CORS, Security-Headern und Antwortkompression ist
implementiert. TOML wird mit c12 eingelesen und mit Zod validiert.
Liveness ist von externen Diensten unabhaengig; Readiness prueft PostgreSQL.
Oxfmt, Oxlint, eine separate Typpruefung, lokale Vitest-Tests und SonarQube-Konfiguration sind
vorhanden. Nach dem separaten minimatch-Sicherheitspaket zu #19 melden
`pnpm audit` und `pnpm audit --prod` keine bekannten Sicherheitsluecken.
OWASP Dependency Check wurde fuer die neuen Dependencies noch nicht erneut
ausgefuehrt; der erforderliche `NVD_API_KEY` ist lokal nicht gesetzt.

Das Studierendenmodell, CSV-Testdaten und wiederholbares Neuladen sind umgesetzt
und gegen PostgreSQL 19rc1 geprueft (#18). Geprueft sind auch Constraints,
Beziehungen, ID-Erzeugung, Loeschkaskaden und Rollback bei einem Importfehler.
Das Drizzle-Schema und seine Beziehungen sind aus der bestehenden Datenbank
abgeleitet und lesend geprueft (#19). DB-Konfiguration, TLS-Pool, manuelle DI,
geordnetes Schliessen, Fetch-Joins, Aggregate-Abbildung, flexible Suche,
Service-Validierung und DB-Readiness sind umgesetzt. Als naechstes folgt
die lesende Studierenden-API (#20).
Die lokalen Tests bilden nur den ersten Teil von Issue #25 ab; Integrationstests
mit der vorgesehenen Datenbank-/Keycloak-Testumgebung folgen spaeter.

## Team

- [@Freud170](https://github.com/Freud170)
- [@JM01332](https://github.com/JM01332)
