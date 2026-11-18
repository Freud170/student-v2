-- Tabellen der Studierenden loeschen, z.B. vor dem Neuladen in der Entwicklung
-- (src/config/dev/db-populate.mts). Reihenfolge wegen der Fremdschluessel:
-- zuerst die abhaengigen Tabellen, dann student.

SET search_path TO student;

DROP TABLE IF EXISTS pruefungsleistung;
DROP TABLE IF EXISTS adresse;
DROP TABLE IF EXISTS student;
