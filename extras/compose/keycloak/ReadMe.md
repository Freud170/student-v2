# Vorhandenen Keycloak gemeinsam betreiben

Der Compose-Stack verwendet Keycloak `26.7.4` mit den vorhandenen Volumes
`kc_data` und `kc_tls`. Realm, Clients und Benutzer liegen in der alten
PostgreSQL-Datenbank `keycloak` in `pg_data`. Fuer diese Daten wird weiterhin
`postgres:19beta4-trixie` verwendet. Die Anwendungsdaten von `student-v2`
liegen getrennt in PostgreSQL 19rc1 und den `*_student_v2`-Volumes.

Es gibt keine Realm-Importe, Bootstrap-Admin-Zugangsdaten, Benutzer-Neuladung
oder Datenbankinitialisierung in dieser Konfiguration. Die alte Datenbank wird
direkt mit `postgres` gestartet; ein fehlender Cluster fuehrt zum Abbruch.
Die bestehende Keycloak-Version wird beibehalten, um keine Schema-Migration
auszuloesen.

## Voraussetzungen pruefen

Alle Befehle gelten ab dem Projektverzeichnis. Die Images muessen lokal
vorhanden sein. App-Image bauen: siehe [README](../../../README.md#docker-image).

```powershell
docker image inspect student-v2:2026.11.0-hardened --format '{{.Id}}'
docker image inspect postgres:19beta4-trixie --format '{{.Id}}'
docker image inspect dhi.io/keycloak:26.7.4-debian13 --format '{{.Id}}'
docker ps -a
docker volume inspect pg_data pg_tablespace pg_init kc_data kc_tls
```

Die alten Volumes muessen bereits eingerichtet sein. Niemals denselben
PostgreSQL-Datenbestand mit zwei Servern oeffnen. Vor dem Start duerfen keine
Container der ersten Abgabe diese Volumes verwenden. Fuer den Wechsel zur
ersten Abgabe zuerst den gesamten `student-v2`-Stack herunterfahren.
Die alten Projektdateien und Volumes werden weder ersetzt noch neu befuellt.

Das DB-Passwort steht ausschliesslich in der ignorierten lokalen Datei
`extras/compose/keycloak/.env`. Falls sie noch fehlt:

```powershell
Copy-Item extras/compose/keycloak/.env.example extras/compose/keycloak/.env
```

Danach bei `KC_DB_PASSWORD=` das vorhandene Passwort der PostgreSQL-Rolle
`keycloak` eintragen. Die Datei verwendet Compose-Raw-Format: keine
Anfuehrungszeichen um den Wert. Keine anderen Zugangsdaten eintragen;
keine vorhandene `.env` ueberschreiben. `config --quiet` validiert ohne
Passwortausgabe; eine vollstaendig aufgeloeste Compose-Konfiguration nicht
in Logs oder Commits aufnehmen.

## TLS und getrennte Netzwerke

`kc_tls` wird read-only unter `/opt/keycloak/tls` eingebunden. Die vorhandenen
Dateien `kc_cert` und `kc_key` bleiben unveraendert. Das Zertifikat muss
`localhost` fuer die lokalen URLs und `keycloak` fuer den Zugriff aus dem
App-Container abdecken. Das vorhandene Zertifikat erfuellt beides.

Keycloak erreicht seine Datenbank als `postgres` ausschliesslich im internen
`keycloak-db-network`. Die Verbindung verwendet `sslmode=verify-full` und
`/opt/keycloak/conf/postgres-ca.crt` als Vertrauensanker. Dieser stammt aus
`extras/compose/postgres/init/tls/server.crt`. Vor dem Start muss seine
SHA-256-Pruefsumme mit `server.crt` im alten `pg_data` uebereinstimmen.
Im vorhandenen Bestand stimmen diese Datei und beide DB-Serverzertifikate
ueberein. Keinen privaten Schluessel oder ein Zertifikat ins Datenvolume
kopieren, um einen Unterschied zu beheben.

Die App erreicht ihre RC1-Datenbank im `acme-network`. Nur App und Keycloak
teilen das zusaetzliche `keycloak-network`. So bleibt der DNS-Name `postgres`
fuer jeden Client eindeutig. Die alte Datenbank hat keinen veroeffentlichten
Host-Port; ihr Container heisst `student-v2-keycloak-db`.

## Gemeinsamer Betrieb

```powershell
docker compose -f extras/compose/student/compose.yml config --quiet
docker compose -f extras/compose/student/compose.yml up -d --wait
docker compose -f extras/compose/student/compose.yml ps
```

Der erste Start baut die Keycloak-Serverkonfiguration im Container auf;
`--wait` wartet auf Bereitschaft. Der Healthcheck verwendet das vorhandene
OpenSSL und Bash, prueft Zertifikat und Hostnamen und verlangt HTTP 200 von
`https://localhost:9000/health/ready` innerhalb des Containers. Ein erfolgreicher
TCP-Verbindungsaufbau allein reicht nicht.

| Zweck | URL auf dem Host |
|---|---|
| Admin-Konsole | `https://localhost:8843` |
| Student-Discovery | `https://localhost:8843/realms/student/.well-known/openid-configuration` |
| Readiness | `https://localhost:9990/health/ready` |
| Liveness | `https://localhost:9990/health/live` |

Alle Keycloak-Ports sind an `127.0.0.1` gebunden. Der bisherige HTTP-Port 8880
bleibt verfuegbar; fuer OIDC und die Pruefungen wird HTTPS verwendet. Der
App-Container erreicht Keycloak unter `https://keycloak:8443`. Die kanonische
Issuer-Konfiguration der Anwendung folgt mit der Token-Pruefung (#30).

Der bestehende Realm `student`, `student-client`, die Client-Rollen `admin`
und `student` sowie die vorhandenen Benutzer werden weiterverwendet. Auch
andere vorhandene Realms bleiben erhalten. Die App verwendet diese Rollen
erst mit #31; dieses Paket aendert keine Rollen oder Client-Einstellungen.

Den gesamten Stack stoppen und seine Container entfernen:

```powershell
docker compose -f extras/compose/student/compose.yml down
```

Alle Daten- und TLS-Volumes sind extern und bleiben erhalten.
