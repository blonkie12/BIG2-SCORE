# Big Two – grote offline- en chronologie-update v21

Deze update vervangt de vorige offline-update. Je hoeft die eerdere update dus
niet eerst uit te voeren.

## Wat deze versie doet

- De laatst gesynchroniseerde stand blijft offline zichtbaar.
- Alleen nieuwe potjes kunnen offline worden ingevoerd.
- Ranglijst, historie en spelersprofielen blijven gepauzeerd tot synchronisatie.
- Elk potje krijgt bij het indrukken van **Potje opslaan** direct de datum en tijd
  van de gebruikte telefoon.
- Supabase bewaart afzonderlijk:
  - `played_at`: wanneer het potje volgens de telefoon is gespeeld/opgeslagen;
  - `created_at`: wanneer Supabase het potje daadwerkelijk heeft ontvangen.
- Potjes van verschillende telefoons worden na latere synchronisatie opnieuw op
  `played_at` gesorteerd.
- Een uniek `client_game_id` voorkomt dubbele potjes wanneer een verbinding
  tijdens synchronisatie wegvalt.
- Oude wachtende potjes uit de eerdere offlineversie worden automatisch met hun
  lokale wachtrijtijd verwerkt.
- Beheerfuncties blijven online-only.
- De eerdere fout rond ontbrekende zoomknoppen en `addEventListener` blijft
  afgevangen.

## Voorbeeld met drie telefoons

Telefoon A voert 2 potjes offline in, telefoon B 1 en telefoon C 3. A
synchroniseert na twee uur en B en C pas de volgende dag. Uiteindelijk staan alle
6 potjes in de geschiedenis op de tijden waarop ze op de telefoons zijn
opgeslagen, niet op de volgorde waarin de telefoons synchroniseerden.

## Stap 1 – Supabase

Open lokaal:

`supabase/offline-en-chronologie-update.sql`

Kopieer alles naar:

Supabase → SQL Editor → New query → Run

Upload de map `supabase` niet naar de openbare GitHub-repository.

## Stap 2 – GitHub

Upload/vervang deze bestanden:

- index.html
- app.js
- styles.css
- sw.js
- manifest.webmanifest
- icon.svg
- big-two-handrangschikking.webp
- .nojekyll

Laat je bestaande `config.js` ongewijzigd.

## Stap 3 – activeren

1. Wacht tot GitHub Pages klaar is met publiceren.
2. Sluit alle open tabbladen of de geïnstalleerde app.
3. Open de website één keer met `?v=21` achter het adres.
4. Open de site minimaal één keer met internet zodat de actuele stand lokaal
   wordt opgeslagen.
5. Test daarna desgewenst in vliegtuigstand.

## Belangrijk

De chronologie is zo betrouwbaar als de datum en tijd van iedere telefoon. Laat
op de telefoons daarom bij voorkeur **automatische datum en tijd** ingeschakeld.
