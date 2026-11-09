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

Unerwartete Fehler liefern eine allgemeine JSON-Antwort mit Status 500.
Request-Middleware, CORS, Antwortzeit und Kompression folgen im naechsten Paket.

## Logging

Pino wird ueber `[log]` in `src/config/config.toml` konfiguriert:

| Einstellung | Bedeutung |
|---|---|
| `level` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` oder `silent` |
| `output` | `console`, `file` oder `both` |
| `dir`, `file` | Verzeichnis und Name der JSON-Logdatei; relative Pfade gelten ab dem Arbeitsverzeichnis |
| `pretty` | Lesbare Konsolenausgabe; Dateien bleiben JSON |

Voreingestellt sind `info`, `both`, `log/server.log` und eine lesbare Konsole.
Das Logverzeichnis wird bei Bedarf angelegt und ist in Git ignoriert. Der Server verwendet den Logger fuer Startmeldungen und unerwartete Fehler.

## Formatierung und Codeanalyse

```powershell
pnpm run fmt          # Formatieren mit Oxfmt (fmt:check prüft nur)
pnpm run lint         # Codeanalyse mit Oxlint (lint:fix korrigiert, was geht)
pnpm run typecheck    # TypeScript-Pruefung ohne Ausgabe von Build-Dateien
pnpm run test:run     # Vitest einmalig; pnpm test fuer den Watch-Modus
```

Die Tests pruefen App-Komposition, Konfiguration und Pino-Ausgabe.
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

## Entwicklung mit Git

Jedes Feature wird auf einem eigenen Branch von einem aktuellen `main` entwickelt.
Die kleinen Commit-Pakete desselben Features bleiben auf diesem Branch. Erst nach
vollstaendiger Umsetzung, Commits und erfolgreichen Pruefungen wird nach `main`
gemergt.
Commit-Messages auf Englisch nach [Conventional Commits](https://www.conventionalcommits.org)
(`feat:`, `fix:`, `docs:`, `chore:` …).

## Stand

Die Hono-Anwendungsbasis mit HTTPS, Router-/Service-Trennung, manueller DI,
Pino-Logging ist implementiert. Die HTTP-Middleware folgt im naechsten Paket. TOML wird mit c12 eingelesen und mit Zod validiert. Oxfmt, Oxlint,
eine separate Typpruefung, lokale Vitest-Tests und SonarQube-Konfiguration sind
vorhanden.

Als naechstes folgt die lesende Studierenden-API mit dem bestehenden Datenmodell
und Drizzle an unserer vorhandenen PostgreSQL-Instanz. Die Abhaengigkeitspruefung
mit `pnpm outdated`, `pnpm audit` und OWASP Dependency Check bleibt offen. Die
lokalen Tests bilden nur den ersten Teil von Issue #25 ab; Integrationstests mit
der vorgesehenen Datenbank-/Keycloak-Testumgebung folgen spaeter.

## Team

- [@Freud170](https://github.com/Freud170)
- [@JM01332](https://github.com/JM01332)
