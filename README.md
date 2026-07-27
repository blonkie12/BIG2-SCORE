# Big Two Vakantiestand

Mobiele webapp voor een gedeelde Big Two-vakantiecompetitie. De interface draait op GitHub Pages; Supabase bewaart de gedeelde spelers, potjes, scores en het logboek.

## Toegang en beheer

- Er is **geen groepscode** meer.
- Iedereen die de website kan openen, kan de stand bekijken en een potje toevoegen.
- De beheerder voegt de spelerslijst toe met de beheerderscode.
- Alle namen kunnen in één keer worden geplakt: één naam per regel of gescheiden door komma’s.
- Alleen de beheerderscode kan spelers toevoegen, activeren/deactiveren en potjes aanpassen of verwijderen.
- De standaard beheerderscode in `supabase/setup.sql` is `9876`. Wijzig deze vóór ingebruikname.

Omdat er geen groepscode is, is de inhoud van de website zichtbaar voor iedereen die de GitHub Pages-link kent.

## Ranglijst

- Een speler wordt pas officieel geklasseerd na **10 gespeelde potjes**.
- Spelers met 0–9 potjes blijven zichtbaar, maar staan grijs onder de officiële ranglijst.
- De officiële ranglijst wordt gesorteerd op **laagste gemiddelde strafpunten per gespeeld potje**.
- Bij exact hetzelfde gemiddelde beslist eerst het aantal gewonnen potjes en daarna het aantal gespeelde potjes.
- Overwinningen en alle strafpunten worden vanaf het eerste potje bijgehouden.

## Puntentelling

Bij drie spelers kan iedere speler maximaal 18 kaarten hebben. De invoergrens wordt automatisch aangepast aan het aantal deelnemers.

- winnaar: 0 strafpunten;
- 1–9 kaarten: 1 strafpunt per kaart;
- 10–12 kaarten: dubbele strafpunten;
- 13 kaarten of meer: altijd 39 strafpunten.

## Historie en PDF-rapport

Op de pagina **Historie** kan een begin- en einddatum worden gekozen. De website berekent vervolgens opnieuw de ranglijst, gemiddelde strafpunten, overwinningen en het aantal gespeelde potjes over uitsluitend die periode. De kwalificatiegrens van 10 potjes geldt binnen de geselecteerde periode.

De knoppen **CSV exporteren** en **PDF opslaan** gebruiken dezelfde geselecteerde periode. **PDF opslaan** opent het afdrukvenster van de browser; kies daar **Opslaan als PDF**. Hiervoor is geen wijziging in Supabase nodig.

## Logboek

De website vraagt bij het openen wie de site gebruikt. De gekozen naam wordt lokaal onthouden en kan bovenaan worden gewijzigd.

Het logboek registreert:

- het openen van de website, eenmaal per browsersessie;
- toevoegen van een potje;
- aanpassen van winnaar, kaarten of opmerking;
- verwijderen van een potje;
- toevoegen van een speler;
- activeren of deactiveren van een speler.

**Let op:** de identiteit is gebaseerd op de naam die de gebruiker zelf kiest. Dit is geschikt voor een vertrouwde vakantiegroep, maar is geen waterdichte gebruikersauthenticatie.

## Eerst in demomodus testen

`config.js` staat standaard op `demoMode: true`. De gegevens en het logboek staan dan alleen in de browser van dat apparaat. De demoversie begint met een lege spelerslijst; ga naar **Beheer** om de namen toe te voegen.

Gebruik bij voorkeur een lokale webserver:

```bash
python -m http.server 8080
```

Open daarna `http://localhost:8080`.

## Gedeelde database instellen of bijwerken

1. Maak een Supabase-project, of open het bestaande project.
2. Open **SQL Editor**.
3. Voer `supabase/setup.sql` volledig uit. Het script verwijdert de oude groepscode en werkt een eerdere installatie bij.
4. Wijzig bij een eerste installatie onderaan het SQL-bestand vooraf:
   - groepsslug;
   - groepsnaam;
   - beheerderscode.
5. Open in Supabase **Project Settings > API**.
6. Kopieer de Project URL en Publishable key.
7. Vul deze in `config.js` in en zet `demoMode` op `false`.
8. Zorg dat `groupSlug` gelijk is aan de slug in de database.

Gebruik uitsluitend de **Publishable key** in de website. Plaats nooit een `service_role`- of secret key in GitHub.

## Publiceren of bijwerken op GitHub Pages

1. Upload de bestanden naar de hoofdmap van de repository.
2. Overschrijf bij deze interface-update `index.html`, `app.js`, `styles.css`, `sw.js` en eventueel `README.md`.
3. Voor de historie- en PDF-functie hoeft `supabase/setup.sql` niet opnieuw te worden uitgevoerd.
4. Ga naar **Settings > Pages**.
5. Gebruik `main` en `/ (root)` als publicatiebron.
6. Herlaad de website na publicatie.

## Beveiligingsmodel

De tabellen zijn niet direct toegankelijk voor publieke websitegebruikers. De webapp roept uitsluitend vooraf gedefinieerde databasefuncties aan. Lezen en potjes toevoegen zijn openbaar; spelersbeheer, correcties en verwijderingen controleren de beheerderscode.
