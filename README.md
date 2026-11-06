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

Voraussetzungen: Node ≥ 26.13 (ältere 26er-Versionen laufen mit Warnung) und
pnpm ≥ 12.17 (ältere Versionen brechen ab, siehe `pmOnFail` in
`pnpm-workspace.yaml`).

```powershell
pnpm install
pnpm run hello      # Server unter https://localhost:3000, beenden mit Strg+C
```

Der Server läuft nur mit HTTPS (HTTP/2 und TLS 1.3, zusätzlich HTTP/1.1 für Bruno).
Zertifikat und privater Schlüssel liegen in `src/config/tls/`. Das Zertifikat ist
selbstsigniert (Browser-Warnung in der Entwicklung bestätigen), der private Schlüssel
liegt deshalb bewusst im Repository.

## Formatierung und Codeanalyse

```powershell
pnpm run fmt          # Formatieren mit Oxfmt (fmt:check prüft nur)
pnpm run lint         # Codeanalyse mit Oxlint (lint:fix korrigiert, was geht)
```

Die Regeln für Oxlint (`oxlint.config.mts`) sind aus dem Beispielprojekt der Vorlesung
übernommen; alle Kategorien sind als Fehler eingestellt, inklusive Typprüfung.

## Entwicklung mit Git

Entwickelt wird auf dem Branch `dev`; `main` erhält stabile Stände nur per Merge.
Commit-Messages auf Englisch nach [Conventional Commits](https://www.conventionalcommits.org)
(`feat:`, `fix:`, `docs:`, `chore:` …).

## Stand

„Hello World“ mit Hono über HTTPS: `GET /` liefert `{"msg":"Hello World"}`
(`src/index-hello.mts`). Port, TLS-Dateien und `allowHTTP1` stehen in
`src/config/config.toml`; `src/config/config.mts` liest die Datei mit c12 ein und
prüft sie mit Zod (bei ungültigen Werten startet der Server nicht). Formatierung mit
Oxfmt und Codeanalyse mit Oxlint sind eingerichtet. Nächster Schritt laut Fahrplan:
statische Codeanalyse mit SonarQube.

## Team

- [@Freud170](https://github.com/Freud170)
- [@JM01332](https://github.com/JM01332)
