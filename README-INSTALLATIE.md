# Big Two – toernooien v27

Update voor de bestaande v26-app. De groepsinstellingen, beheerderscode en gewone uitslagen blijven behouden.

## Supabase

De aanvullende migraties zijn op 18 oktober 2026 al toegepast op het gekoppelde BIG2-project en gecontroleerd met een teruggedraaide testtransactie. Voer ze daar niet opnieuw uit.

Voor een andere bestaande installatie: voer de SQL-bestanden in `supabase/migrations/` eenmaal op bestandsnaamvolgorde uit, vóór het publiceren van de app. Ze voegen drie eigen toernooitabellen en bijbehorende RPCs toe. Ze vervangen geen bestaande tabellen, functies of beheerderscode. Een lege database heeft eerst het oorspronkelijke Big Two-schema nodig.

De nieuwe tabellen geven geen directe lees- of schrijfrechten aan bezoekers. Een gastlink levert alleen de deelnemers en uitslagen van het bijbehorende toernooi. Beheer van dat toernooi werkt, zoals afgesproken, op basis van de gekozen naam en goed vertrouwen.

## GitHub Pages

Publiceer samen:

- index.html
- tournament.html
- app.js
- tournaments.js
- styles.css
- sw.js

Behoud de bestaande `config.js`, `manifest.webmanifest`, `icon.svg` en `big-two-handrangschikking.webp`. De migraties bevatten geen wachtwoorden of geheime API-sleutels.

Na samenvoegen van de update naar `main` publiceert GitHub Pages de nieuwe app. Laat de app met internet opnieuw openen zodat de serviceworker v27 wordt geladen. Bij een nog geopende oude versie kan nogmaals sluiten en openen nodig zijn. Een geïnstalleerde app blijft het huidige hoofdadres gebruiken en vindt daar het actieve toernooi zelf.

## Gebruik

1. Kies je eigen bestaande spelersnaam.
2. Ga naar Beheer → Nieuw toernooi en voer de huidige beheerderscode in.
3. Geef een naam van maximaal 20 tekens op, kies spelers en voeg gastnamen toe.
4. Deel de link uit Beheer met nieuwe gasten. Bestaande gebruikers openen hun huidige app en komen automatisch in het toernooi.
5. Namen kunnen tijdens het toernooi via Beheer worden toegevoegd. Alleen de gekozen game master krijgt die bediening.
6. Toernooi verlaten via Beheer geldt alleen voor de betreffende telefoon en vraagt bevestiging.
7. Na synchronisatie van alle telefoons kan de game master afsluiten. Het toernooi staat dan als archiefkeuze naast de gewone standen; de gewone stand bevat geen toernooipotjes.

De volledige werking, het vertrouwensmodel en de ontwikkeltests staan in README.md.
