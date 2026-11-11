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

## Tabellen und CSV-Testdaten importieren

Voraussetzung ist die eingerichtete `student-v2`-Instanz mit den eigenen Volumes, Schema `student`
und Tablespace `studentspace`. Die aktuellen SQL- und CSV-Dateien muessen wie in
Schritt 2 im Init-Volume liegen und fuer den PostgreSQL-Prozess lesbar sein.
Eine lokale Dateiaenderung aktualisiert das Named Volume nicht automatisch.
Bei einer bereits eingerichteten Instanz die Dateien wie im folgenden Abschnitt
gezielt aktualisieren; die Ersteinrichtung nicht wiederholen.

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

## Testdaten wiederholbar neu laden

Nur fuer die `student-v2`-Testdatenbank: Alle vorhandenen Studierenden, Adressen
und Pruefungsleistungen werden durch die CSV-Testdaten ersetzt. Die Anwendung
muss dabei beendet sein. Die Tabellen muessen bereits mit `create-table.sql`
angelegt worden sein. Schema, Tabellenstruktur, Rollen und Zertifikate bleiben
erhalten. Vorher den aktiven Container und seine Volume-Zuordnung pruefen:

```powershell
docker compose ps
docker inspect postgres --format '{{.Config.Image}}'
docker inspect postgres --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
```

Erwartet werden `postgres:19rc1-trixie`, `pg_data_student_v2` unter
`/var/lib/postgresql/19/docker`, `pg_tablespace_student_v2` unter `/tablespace`
und `pg_init_student_v2` unter `/init`. Bei einer anderen Zuordnung nicht fortfahren.

Aktuelle SQL- und CSV-Dateien gezielt ins Init-Volume kopieren, aus
`extras\compose\postgres`:

```powershell
docker run -v pg_init_student_v2:/init -v ./init:/tmp/init:ro --rm -it -u 0 --entrypoint '' postgres:19rc1-trixie /bin/bash
```

In der Bash des Hilfscontainers:

```bash
mkdir -p /init/student/csv
cp /tmp/init/student/sql/*.sql /init/student/sql/
cp /tmp/init/student/csv/*.csv /init/student/csv/
chown postgres:postgres /init/student/sql /init/student/csv /init/student/sql/*.sql /init/student/csv/*.csv
chmod 400 /init/student/sql/*.sql /init/student/csv/*.csv
exit
```

Danach in PowerShell einen einzigen `psql`-Aufruf verwenden:

```powershell
docker compose exec postgres psql --dbname=student --username=postgres --set=ON_ERROR_STOP=1 --single-transaction --file=/init/student/sql/reset-data.sql --file=/init/student/sql/copy-csv.sql
```

`reset-data.sql` leert nur die drei explizit genannten Tabellen mit `TRUNCATE`
und setzt ihre Identity-Sequenzen auf den Startwert 1000 zurueck. Es verwendet
kein `CASCADE`; unerwartete Fremdschluessel aus weiteren Tabellen fuehren zum
Abbruch. Durch `--single-transaction` werden Reset und alle drei CSV-Importe
gemeinsam abgeschlossen. Bei einem Fehler bleiben Daten und Sequenzen auf dem
Stand vor dem Aufruf. Jeder erfolgreiche Aufruf stellt dieselben 5 Studierenden,
5 Adressen und 6 Leistungen wieder her.

Anschliessend den Bestand pruefen:

```powershell
docker compose exec postgres psql --dbname=student --username=student --set=ON_ERROR_STOP=1 --command="SELECT (SELECT count(*) FROM student.student) AS studierende, (SELECT count(*) FROM student.adresse) AS adressen, (SELECT count(*) FROM student.pruefungsleistung) AS leistungen;"
```

Erwartetes Ergebnis: `5 | 5 | 6`. Die SQL-Konsole kann fuer die Beziehungspruefung
verwendet werden:

```sql
SELECT s.id, count(DISTINCT a.id) AS adressen, count(p.id) AS leistungen
FROM student.student AS s
LEFT JOIN student.adresse AS a ON a.student_id = s.id
LEFT JOIN student.pruefungsleistung AS p ON p.student_id = s.id
GROUP BY s.id ORDER BY s.id;
```

Erwartet: IDs `1, 20, 30, 40, 50`, jeweils eine Adresse und der Reihe nach
`2, 0, 1, 2, 1` Leistungen. Das Neuladen wird ausschliesslich manuell aufgerufen;
App-Start und lokale Vitest-Tests veraendern die Datenbank nicht.

Gegen PostgreSQL 19rc1 geprueft: Erstimport, zwei aufeinanderfolgende Neuladevorgaenge
mit identischen Daten und Sequenzen, Identity-Start bei 1000, Version 0,
Eindeutigkeit, Pflichtfelder, Matrikelnummer-/PLZ-Format, Notenstufen,
Fremdschluessel und Loeschkaskaden. Ein gezielt fehlerhafter COPY-Aufruf nach dem
Reset hat den vorherigen Datenbestand und alle drei Sequenzen vollstaendig
erhalten. Diese Datenbankpruefungen sind manuelle Integrationspruefungen und kein
Teil von `pnpm run test:run`.

## TLS-Verbindung pruefen

Eine Verbindung mit Hostnamen- und Zertifikatspruefung aus dem laufenden Container:

```powershell
docker compose exec postgres psql --dbname="host=postgres dbname=student sslmode=verify-full sslrootcert=/init/tls/server.crt" --username=student --set=ON_ERROR_STOP=1 --command="SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid();"
```

Das vorhandene Zertifikat deckt `postgres`, `localhost` und `127.0.0.1` ab.
Die Verbindung mit `sslmode=verify-full` wurde erfolgreich mit TLS 1.3 geprueft.

## Betrieb

```powershell
docker compose up -d     # starten (im Hintergrund)
docker compose down      # beenden
docker compose exec postgres psql --dbname=student --username=student   # SQL-Konsole
```

In `psql` zeigt `SHOW ssl;` an, ob TLS aktiv ist; beenden mit `\q`.
