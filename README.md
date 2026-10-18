# Big Two Score

Mobiele scoreapp op GitHub Pages met een gedeelde Supabase-database. Deze versie voegt zelfstandige toernooien toe aan de bestaande jaarstanden, periodes, historie, archief en offline invoer.

## Toernooien (v27)

Ga met je eigen spelersnaam naar **Beheer → Nieuw toernooi**. De bestaande beheerderscode opent de aanmaakpagina. Geef een naam van 2–20 tekens op, selecteer bestaande spelers en vul eventuele nieuwe namen in. De maker doet automatisch mee en wordt game master. Er kan één toernooi tegelijk actief zijn.

Bestaande gebruikers openen hun huidige app. Die vindt het actieve toernooi automatisch; zij hebben geen deellink nodig. Hun bestaande naam wordt herkend wanneer deze deelnemer is. De app controleert ook wanneer deze na gebruik op de achtergrond weer wordt geopend. Voor het ontdekken van een nieuw toernooi is verbinding nodig. Een eerder opgehaald actief toernooi kan ook offline worden geopend.

De game master kan via Beheer de naam veranderen, deelnemers toevoegen of verwijderen en afsluiten. Dit werkt op basis van de zelfgekozen naam en goed vertrouwen, zonder extra wachtwoord. Wie de naam van de game master kiest, heeft diens mogelijkheden. De game master blijft deelnemer tot afsluiten. Verwijderen van een deelnemer stopt nieuwe deelname; eerdere uitslagen blijven bestaan en meetellen. Opnieuw toevoegen activeert dezelfde toernooideelnemer.

De deellink staat in Beheer. Nieuwe gasten kiezen hun naam uit de toegevoegde deelnemers. De gastweergave haalt uitsluitend dit toernooi op en toont geen gewone periodes, spelerslijst of logboek. Het gewone hoofdadres blijft openbaar, zoals bij de bestaande app. De link vormt geen afscherming van dat hoofdadres.

Een gebruiker die vanuit de gewone app komt, kan uitsluitend via **Beheer → Toernooi verlaten** terugkeren, na de waarschuwing ‘Weet je zeker dat je toernooi wilt verlaten?’. Alleen die telefoon keert terug; de deelnemer blijft in het toernooi. Deze keuze wordt per browser/apparaat onthouden. Handmatig openen via Beheer of de keuzelijst heft deze keuze op; een nieuw toernooi opent weer automatisch.

Toernooien hebben eigen deelnemers, potjes, ranglijsten en offline wachtrijen. Nieuwe gastnamen worden niet toegevoegd aan de gewone spelerslijst. Toernooipotjes tellen niet mee in enige gewone periode- of jaarstand. Er geldt geen grens van tien potjes: spelers tellen vanaf hun eerste potje mee. Zonder potjes staan zij onderaan. Het rangschikkingscriterium wordt bij aanmaken overgenomen van de groep en staat voor het toernooi vast.

Na afsluiten staat het toernooi als archiefkeuze in de gewone keuzelijst. Uitslagen en deelnemers zijn dan alleen-lezen; de eindstand en top-3-oorkondes kunnen worden afgedrukt. Laat eerst alle telefoons hun offline potjes synchroniseren. Niet eerder ontvangen scores worden na afsluiten geweigerd en blijven lokaal in hun eigen wachtrij staan.

## Gewone competitie

Gewone periodes blijven los van de toernooien werken. Een periodestand telt vanaf tien potjes officieel mee. De jaarstand vereist minimaal tien potjes in iedere afgesloten periode van dat jaar. Beheer kan het rangschikkingscriterium kiezen. Een afgesloten periode bewaart het eigen criterium en is alleen-lezen.

Scores: winnaar nul, 1–9 kaarten één strafpunt per kaart, 10–12 kaarten dubbel, vanaf 13 kaarten maximaal 39 strafpunten. Elk potje heeft 2–8 deelnemers; de kaartlimiet is afhankelijk van dat aantal. Sortering gebruikt de volledige getallen en pas de weergave rondt af.

## Database en toegang

De browser gebruikt uitsluitend de publishable key uit `config.js` en vooraf gedefinieerde databasefuncties. De nieuwe toernooitabellen hebben RLS en geen directe rechten voor `anon` of `authenticated`. Interne helpers staan in `big2_private` en zijn voor deze rollen niet uitvoerbaar. Publieke functies controleren de toernooilink, de gekozen game master of de bestaande beheerderscode, afhankelijk van de actie. Er staat geen beheerderscode in de broncode of migraties.

Supabase Advisors meldt openbare `SECURITY DEFINER`-functies en RLS zonder policies. Dat is hier bewust: tabellen zijn dicht en de expliciet toegestane RPCs vormen de toegang. Zie [databasefuncties](https://supabase.com/docs/guides/database/functions) en [de linter-uitleg](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable). Het bestaande publieke hoofdadres en de eerdere gewone RPCs zijn ongewijzigd.

## Bijwerken en testen

Zie `README-INSTALLATIE.md` voor de update van de bestaande v26-installatie. Deze repository bevat geen volledig installatieschema voor een lege database.

De app heeft geen buildstap. Testhulpmiddelen zijn alleen voor ontwikkeling:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run check
node tests/local-preview.mjs
```

De lokale preview draait op `http://127.0.0.1:8765` met verzonnen spelers en een tijdelijke database in het geheugen. De testcode is `test-pin`. Deze preview maakt geen verbinding met Supabase. De databasetests gebruiken echte lokale Postgres-functies, met fixtureversies van de bestaande groeps- en PIN-helpers. Zij controleren onder meer toegangsrechten, scheiding van gewone uitslagen, archivering en dubbele synchronisatie.
