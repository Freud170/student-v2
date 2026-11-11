# PostgreSQL für student-v2

PostgreSQL 19rc1 läuft als Docker-Container mit TLS (angelehnt an das Hono-Beispiel
der Vorlesung). Container-Name `postgres` und Port 5432 sind dieselben wie in anderen
Projekten: vorher prüfen, dass kein anderer PostgreSQL-Container läuft (`docker ps`).

Passwort von `postgres` und `student` ist `p` (nur für die Entwicklung). Zertifikat
und privater Schlüssel in `init/tls` sind selbstsigniert (CN=postgres) und deshalb
bewusst im Repository.

## Einmalige Einrichtung

Alle Befehle in PowerShell im Verzeichnis `extras\compose\postgres`.

### 1. Named Volumes anlegen

```powershell
docker volume create pg_data_student_v2
docker volume create pg_tablespace_student_v2
docker volume create pg_init_student_v2
```

### 2. SQL-Skripte und TLS-Dateien in das Volume kopieren

Ein Hilfscontainer mit Root-Rechten kopiert `init` nach `/init` (Volume
`pg_init_student_v2`), legt das Verzeichnis für den Tablespace an und setzt Owner
und Rechte:

```powershell
docker run -v pg_init_student_v2:/init -v pg_tablespace_student_v2:/tablespace -v ./init:/tmp/init:ro `
  --rm -it -u 0 --entrypoint '' postgres:19rc1-trixie /bin/bash
```

In der Bash des Containers:

```bash
cp -r /tmp/init/* /init
mkdir /tablespace/student
chown -R postgres:postgres /init /tablespace
chmod 400 /init/*/sql/* /init/tls/*
exit
```

### 3. Erster Start ohne TLS

PostgreSQL legt beim ersten Start sein Datenverzeichnis an, das dafür leer sein muss.
In `compose.yml` deshalb **vorübergehend**:

1. `command:` mit den drei Zeilen darunter auskommentieren (noch kein TLS)
2. `user: "postgres:postgres"` auskommentieren
3. bei `cap_add:` den Kommentar entfernen

Ohne 2. und 3. bricht der Container mit `initdb: error: could not change permissions
of directory` ab und startet in einer Schleife neu: Das leere Volume gehört `root`, und
`cap_drop: [ALL]` verbietet das Ändern von Owner und Rechten. Dann zuerst
`docker compose down` und die Änderungen nachholen.

```powershell
docker compose up -d
docker compose logs postgres     # warten auf "database system is ready to accept connections"
docker compose exec postgres bash -c 'cp -p /init/tls/* /var/lib/postgresql/19/docker'
docker compose exec postgres ls -l /var/lib/postgresql/19/docker/server.crt /var/lib/postgresql/19/docker/server.key
docker compose down
```

`cp -p` behält Owner `postgres` und Rechte `-r--------` bei; ohne `-p` würden die
Dateien `root` gehören und PostgreSQL könnte den Schlüssel nicht lesen.

Danach alle drei Änderungen in `compose.yml` wieder rückgängig machen.

### 4. Start mit TLS, Datenbank und Schema anlegen

```powershell
docker compose up -d
docker compose exec postgres psql --dbname=postgres --username=postgres --file=/init/student/sql/create-db.sql
docker compose exec postgres psql --dbname=student --username=student --file=/init/student/sql/create-schema.sql
```

Angelegt werden der DB-User `student`, die Datenbank `student`, der Tablespace
`studentspace` und das Schema `student`. Tabellen und Testdaten folgen mit dem
Datenmodell.

## Betrieb

```powershell
docker compose up -d     # starten (im Hintergrund)
docker compose down      # beenden
docker compose exec postgres psql --dbname=student --username=student   # SQL-Konsole
```

In `psql` zeigt `SHOW ssl;` an, ob TLS aktiv ist; beenden mit `\q`.
