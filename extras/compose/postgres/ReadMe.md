# PostgreSQL für student-v2

PostgreSQL 19rc1 wird als Docker-Container mit TLS betrieben.
Container-Name `postgres` und Port 5432 sind dieselben wie in anderen
Projekten: vorher prüfen, dass kein anderer PostgreSQL-Container läuft (`docker ps`).

Die Volumes `pg_data_student_v2`, `pg_tablespace_student_v2` und `pg_init_student_v2`
sind von denen der ersten Abgabe getrennt. Deren PostgreSQL 19beta4 verwendet
die Katalogversion `202609165`, PostgreSQL 19rc1 dagegen `202610061`.
Der alte Datenbestand kann daher nicht direkt mit dem RC1-Server geoeffnet werden.
Die vorhandenen alten Daten- und Tablespace-Volumes bleiben erhalten; das eigene
Init-Volume trennt zusaetzlich SQL-, CSV- und TLS-Dateien.
Quellen: [Katalogversion Beta 4](https://raw.githubusercontent.com/postgres/postgres/REL_19_BETA4/src/include/catalog/catversion.h)
und [Katalogversion RC1](https://raw.githubusercontent.com/postgres/postgres/REL_19_RC1/src/include/catalog/catversion.h).

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

### 2. SQL-Skripte, CSV-Testdaten und TLS-Dateien in das Volume kopieren

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
chmod 400 /init/*/sql/* /init/*/csv/* /init/tls/*
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
`studentspace` und das Schema `student`. Die Tabellendefinitionen liegen in
`init/student/sql/create-table.sql`; die obigen Befehle fuehren sie noch nicht aus.
Das Skript setzt Schema und Tablespace voraus und legt fehlende Tabellen und
Indizes an. Bestehende Tabellendefinitionen werden nicht migriert.

## Tabellen und CSV-Testdaten importieren (vorbereitet)

Dieser Ablauf ist noch nicht gegen die Testdatenbank geprueft. Voraussetzung ist
die eingerichtete `student-v2`-Instanz mit den eigenen Volumes, Schema `student`
und Tablespace `studentspace`. Die aktuellen SQL- und CSV-Dateien muessen wie in
Schritt 2 im Init-Volume liegen und fuer den PostgreSQL-Prozess lesbar sein.
Eine lokale Dateiaenderung aktualisiert das Named Volume nicht automatisch.
Bei einer bereits eingerichteten Instanz folgt das gezielte Nachladen der Dateien
mit dem Ablauf zum wiederholbaren Neuladen; die Ersteinrichtung nicht wiederholen.

Nur fuer eine leere Testdatenbank bzw. leere Tabellen, aus
`extras\compose\postgres`:

```powershell
docker compose exec postgres psql --dbname=student --username=student --set=ON_ERROR_STOP=1 --single-transaction --file=/init/student/sql/create-table.sql
docker compose exec postgres psql --dbname=student --username=postgres --set=ON_ERROR_STOP=1 --single-transaction --file=/init/student/sql/copy-csv.sql
```

Jeden Befehl einzeln ausfuehren und nur bei Erfolg fortfahren. Der Import verwendet
den DB-Superuser `postgres`, weil `COPY FROM` serverseitige Dateien liest. Alle
drei CSV-Importe laufen im zweiten Befehl in einer gemeinsamen Transaktion;
bei einem Fehler wird abgebrochen und kein Teilimport uebernommen.

| Datei | Datensaetze | Inhalt |
|---|---:|---|
| `student.csv` | 5 | Studierende mit Version 0 und festen Zeitstempeln |
| `adresse.csv` | 5 | Eine Adresse fuer jeden Teststudierenden |
| `pruefungsleistung.csv` | 6 | Studierende mit keiner, einer oder mehreren Leistungen |

Die Dateien sind UTF-8 mit Semikolon als Trennzeichen und einer Kopfzeile.
`copy-csv.sql` importiert zuerst Studierende, danach Adressen und Leistungen;
die Spaltenlisten entsprechen den CSV-Kopfzeilen. Alle festen IDs liegen unter
1000. `COPY` uebernimmt diese IDs auch bei Identity-Spalten; die Sequenzen der
frisch angelegten Tabellen beginnen weiterhin bei 1000.

Das Importskript leert keine Tabellen und ist allein kein wiederholbares Neuladen:
ein zweiter Import derselben IDs scheitert an den Primaerschluesseln. Es wird
nicht beim App-Start ausgefuehrt und legt keine Keycloak-Benutzer an.
Zuruecksetzen, erneutes Laden und die Datenbankpruefungen folgen in Paket 3 von #18.

## Betrieb

```powershell
docker compose up -d     # starten (im Hintergrund)
docker compose down      # beenden
docker compose exec postgres psql --dbname=student --username=student   # SQL-Konsole
```

In `psql` zeigt `SHOW ssl;` an, ob TLS aktiv ist; beenden mit `\q`.
