# Student

Appserver mit Hono zur Verwaltung von Studierendendaten (Aufgabe 3 im Modul
Software Engineering, Hochschule Karlsruhe).

Fachlich entspricht das Projekt unserer Aufgabe 1 (`student`, FastAPI), technisch
orientiert es sich am Hono-Beispielprojekt „buch“ aus der Vorlesung. Wir gehen nach dessen
`VORGEHENSWEISE.md` schrittweise vor.

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

Voraussetzungen gemäß Hono- und Drizzle-Beispiel: Node `^26.13.0` und
pnpm `^12.18.0` (jeweils innerhalb derselben Hauptversion). Eine unpassende
pnpm-Version führt zum Abbruch, siehe `pmOnFail` in `pnpm-workspace.yaml`.

```powershell
pnpm install
pnpm run dev       # HTTPS unter https://localhost:3000 mit Watch-Modus
# Alternativ: pnpm start ohne Watch-Modus; beenden mit Strg+C
```

`pnpm run hello` bleibt als Alias fuer den Watch-Modus verfuegbar. Vor dem Start
muss Port 3000 frei sein, insbesondere darf dort nicht bereits die Anwendung aus
der ersten Abgabe laufen. Fuer diesen Stand werden PostgreSQL und Keycloak nicht
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

Die Anwendung greift noch nicht auf die Datenbank zu; Tabellen und Testdaten folgen
mit dem Datenmodell.

## Anwendungsbasis

`src/index.mts` liest die Konfiguration, erzeugt einmal den DI-Container und startet
den HTTPS-Server. `src/app.mts` setzt die Router und Middleware zusammen und kann
ohne Serverstart getestet werden. Der Container haelt einen gemeinsamen Pino-Logger
und eine `StudentService`-Instanz fuer alle Requests der Anwendung. Abhaengigkeiten
werden explizit an die Router und Services uebergeben.

| Route | Verhalten |
|---|---|
| `GET /` | Bestehendes `{"msg":"Hello World"}` |
| `GET /rest` | `{"msg":"Hello Student"}` aus dem injizierten Student-Service |
| `HEAD /`, `HEAD /rest` | Dieselben Statuscodes und Header, ohne Response-Body |
| Unbekannte Route | JSON mit Status 404 |

`/rest` ist der Einstieg fuer die spaetere Studierenden-API, noch keine Suche und
keine Liste von Studierenden. Repository, Datenmodell, Schreibrouter, GraphQL und
Keycloak-Anbindung folgen mit den jeweiligen Funktionen. `Student` bleibt das
zentrale Aggregate mit Adresse (1:1) und Pruefungsleistungen (1:N).

Globale Middleware setzt Security-Header (u.a. HSTS und `nosniff`), CORS und
Antwortkompression mit `hono/compress`. Die erlaubten Browser-Origins stehen in
`[cors].origins` in `src/config/config.toml`; aktuell sind nur `GET` und `HEAD`
freigegeben. Preflights erhalten Status 204. Nicht freigegebene Origins erhalten
keinen `Access-Control-Allow-Origin`-Header; CORS ersetzt keine Authentifizierung.
Die Hono-Optionen heissen `allowHeaders` und `exposeHeaders`.

Antworten werden bei passendem `Accept-Encoding` mit gzip oder deflate komprimiert.
`hono/compress` komprimiert keine eingehenden Request-Bodies. Die entsprechende
Formulierung in Issue #14 ist damit noch nicht abgedeckt; fuer die spaeteren
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

Die Tests pruefen App-Komposition, Middleware, Konfiguration und Pino-Ausgabe.
Sie verwenden keine laufenden Server und keine Datenbank-Fixtures. Die Pino-Tests
starten eigene Node-Prozesse, pruefen deren Ausgabe und entfernen ihre temporaeren
Logverzeichnisse unter `temp`. Tests gegen PostgreSQL/Keycloak, Bruno und Lasttests
sind noch nicht eingerichtet.

Die Regeln für Oxlint (`oxlint.config.mts`) sind aus dem Beispielprojekt der Vorlesung
übernommen; alle Kategorien sind als Fehler eingestellt, inklusive Typprüfung.

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
implementiert. TOML wird mit c12 eingelesen und mit Zod validiert. Oxfmt, Oxlint,
eine separate Typpruefung, lokale Vitest-Tests und SonarQube-Konfiguration sind
vorhanden. Die Abhaengigkeiten sind aktuell und geprueft: `pnpm audit --prod` und
OWASP Dependency Check melden keine Sicherheitsluecken.

Als naechstes folgt die lesende Studierenden-API mit dem bestehenden Datenmodell
und Drizzle an unserer vorhandenen PostgreSQL-Instanz. Die lokalen Tests bilden nur den ersten Teil von Issue #25 ab; Integrationstests mit
der vorgesehenen Datenbank-/Keycloak-Testumgebung folgen spaeter.

## Team

- [@Freud170](https://github.com/Freud170)
- [@JM01332](https://github.com/JM01332)
