# Student

Appserver mit Hono zur Verwaltung von Studierendendaten (Aufgabe 3 im Modul
Softwareengineering, Hochschule Karlsruhe, Prof. Dr. Jürgen Zimmermann).

Fachlich entspricht das Projekt unserer Aufgabe 1 (`student`, FastAPI), technisch
orientiert es sich am Hono-Beispielprojekt „buch“ des Profs. Wir gehen nach dessen
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

## Stand

Projektstart: Repository mit README, `.gitignore`, `.editorconfig` und
`.gitattributes`. Nächster Schritt laut Fahrplan: pnpm und Hono mit einem
„Hello World“-GET-Request.

## Team

- Rico Hornung ([Freud170](https://github.com/Freud170))
- [JM01332](https://github.com/JM01332)
