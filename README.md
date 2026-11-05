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

Voraussetzungen: Node ≥ 26.13 und pnpm ≥ 12.17 (ältere 26er- bzw. 12er-Versionen
laufen mit Warnung).

```powershell
pnpm install
pnpm run hello      # Server unter http://localhost:3000, beenden mit Strg+C
```

## Stand

„Hello World“ mit Hono: `GET /` liefert `{"msg":"Hello World"}`
(`src/index-hello.mts`). Nächster Schritt laut Fahrplan: Server mit TLS (HTTPS).

## Team

- [@Freud170](https://github.com/Freud170)
- [@JM01332](https://github.com/JM01332)
