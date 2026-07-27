# Big Two Vakantiestand

Mobiele webapp voor een gedeelde Big Two-competitie. De interface draait als statische site op GitHub Pages. Supabase bewaart de gedeelde spelers, potjes en scores.

## Functies

- deelnemers aanvinken per potje;
- winnaar kiezen uit alleen de geselecteerde spelers;
- overgebleven kaarten invoeren;
- strafpunten automatisch berekenen;
- 1 punt per gewonnen potje;
- totaal potjes en potjes per speler;
- winstpercentage, totaal en gemiddelde strafpunten;
- ranglijst en volledige historie;
- spelers activeren/deactiveren;
- foutief potje verwijderen met beheerderscode;
- CSV-export;
- installeerbaar als app op een telefoon.

## Puntentelling

- winnaar: 1 competitiepunt en 0 strafpunten;
- 1–9 kaarten: aantal kaarten als strafpunten;
- 10–12 kaarten: dubbele strafpunten;
- 13 kaarten: 39 strafpunten;
- ranglijst: meeste competitiepunten, dan hoogste winstpercentage, dan laagste gemiddelde strafpunten.

## Eerst lokaal proberen

`config.js` staat standaard op `demoMode: true`. Open `index.html` via een lokale webserver. De demo gebruikt `localStorage`; de gegevens worden dus nog niet tussen apparaten gedeeld.

Bijvoorbeeld met Python:

```bash
python -m http.server 8080
```

Open daarna `http://localhost:8080`.

## Gedeelde database instellen

1. Maak een Supabase-project.
2. Open **SQL Editor** en voer `supabase/setup.sql` volledig uit.
3. Wijzig onderaan het SQL-bestand vóór uitvoering:
   - groepsslug;
   - groepsnaam;
   - groepscode;
   - beheerderscode.
4. Open in Supabase **Project Settings > API**.
5. Kopieer de Project URL en de Publishable key.
6. Vul deze waarden in `config.js` in en zet `demoMode` op `false`.
7. Zorg dat `groupSlug` exact gelijk is aan de slug in het SQL-bestand.

Gebruik uitsluitend de **Publishable key** in de website. Plaats nooit een `service_role`- of secret key in GitHub.

## Publiceren op GitHub Pages

1. Maak een nieuwe repository, bijvoorbeeld `big2-score`.
2. Upload alle bestanden uit deze map naar de root van de repository.
3. Ga naar **Settings > Pages**.
4. Kies **Deploy from a branch**.
5. Selecteer `main` en `/ (root)`.
6. Na publicatie staat de site op `https://JOUWNAAM.github.io/big2-score/`.

## Beveiligingsmodel

De database-tabellen zijn niet direct toegankelijk voor publieke gebruikers. De website mag alleen vooraf gedefinieerde databasefuncties aanroepen. Iedere lees- of schrijfactie controleert de groepscode. Beheeracties controleren apart de beheerderscode.

Voor een vakantiegroep is dit een praktisch toegangsmodel. Gebruik voor gevoelige of persoonlijke gegevens volwaardige gebruikersaccounts in plaats van een gedeelde code.
