# Prosjektpanel

Prosjektpanel er en webapp for å holde oversikt over **oppgaver** og **økonomi** i prosjekter og arrangementer. Flere personer kan samarbeide i samme prosjekt. Grensesnittet er på norsk bokmål. Hvert prosjekt har en egen regnskapsvaluta (standard DKK), og poster kan registreres i andre valutaer.

**Nettadresse:** https://oliversaugestad-prog.github.io/APP-Dashboard/ (publiseres automatisk fra standardgrenen)
**Database og innlogging:** Supabase-prosjektet `prosjektpanel` (`ncpzicyhunztfbyognaq`, Stockholm/eu-north-1)

## Slik tar du appen i bruk

1. Åpne appen og velg **Opprett konto** (navn, e-post og passord). Bekreft e-postadressen via lenken du får tilsendt, og logg inn.
2. Opprett et prosjekt og velg regnskapsvaluta. Oppgi gjerne en startsaldo, altså pengene prosjektet har før dere registrerer poster. Den kan endres senere.
3. Inviter andre under **Prosjekt → Innstillinger og medlemmer**. Den inviterte oppretter konto med samme e-postadresse, og invitasjonen dukker opp under **Alle prosjekter**. Du kan kopiere en ferdig invitasjonstekst med lenke.
4. Registrer oppgaver og ideer under **Oppgaver**, og utgifter og inntekter under **Økonomi**. Sett budsjett per måned under **Måneder**.

## Hva appen gjør

| Område | Innhold |
| --- | --- |
| **Oppgaveliste** | Notion-lignende tabell med tittel, kategori, beskrivelse, status, ansvarlig, frist og type (oppgave eller idé). Alle cellene kan endres direkte, og du kan legge til egne egenskaper (tekst, tall, valg, flervalg, dato, person, avkrysning og lenke) med **+** i overskriften. Visningene *Alle*, *Mine oppgaver* og *Ideer*. Du kan filtrere på person, status, kategori, type og frist, søke og sortere på alle kolonner. Fullfør med avkrysning, endre status direkte i tabellen og gjør ideer om til oppgaver. |
| **Kalender** | Samme kalender som i StudyPath: dag, uke og måned, sidepanel med minikalender og av/på per kalender, og en boble med detaljer når du klikker på noe. Klikk eller dra i rutenettet for å lage en hendelse, dra den for å flytte den og i underkanten for å forlenge den. I månedsvisningen drar du over dager. Oppgaver med frist og kommende forekomster av gjentakende oppgaver vises også. Snarveier: T (i dag), D/U/M (visning), N (ny), ← → (bla). |
| **Gjentakende oppgaver** | En oppgave kan gjentas daglig, ukentlig på valgte dager, månedlig eller årlig, hver N-te gang og eventuelt til en sluttdato. Når den fullføres, lager databasen neste forekomst med ny frist. Visningen «Gjentakende» viser de aktive seriene, og hendelser i kalenderen kan gjentas på samme måte. |
| **Ansvar per person** | Oppgavene til hver person med antall per status og forfalte oppgaver, pluss oppgaver uten ansvarlig. |
| **Poster** | Alle utgifter og inntekter med navn, beløp, type, dato, kategori, måned, hvem som betalte eller mottok, og hvem som registrerte posten. Du kan filtrere, søke, sortere og gruppere. Nøkkeltallene viser inntekter, utgifter, resultat og saldo. |
| **Måneder** | Ett kort per måned med budsjett, utgifter, inntekter, resultat, hva som er igjen av budsjettet eller hvor mye det er overskredet, en fremdriftsindikator og saldo ved månedsslutt. |
| **Månedsdetaljer** | Startsaldo + inntekter − utgifter = sluttsaldo, budsjett og forbruk, og alle postene i måneden. Postene kan grupperes og filtreres på type, kategori og person. |
| **Per person** | Hvem som har betalt hvilke utgifter, og hvilke inntekter som er knyttet til hver person. Du ser summer for valgt måned eller for hele prosjektet. |
| **Valuta** | Velg valuta ved siden av beløpet når du registrerer en post (DKK, NOK, SEK, EUR, USD, GBP og flere). Kursen for postens dato hentes automatisk fra Den europeiske sentralbanken (via Frankfurter), og beløpet regnes om til prosjektets regnskapsvaluta. Du kan overstyre kursen for hånd. Originalbeløpet vises under det omregnede i tabellen. Eiere kan bytte regnskapsvaluta under **Innstillinger → Valuta**. Da regnes alle poster om med kursen på postens dato, budsjetter med kursen den 1. i måneden og startsaldoen med dagens kurs. |
| **Innstillinger** | Prosjektnavn og startsaldo (bare eiere), medlemmer med roller og ansvarsområder (oppgaver, økonomi eller begge), invitasjoner, eget navn, tema (lyst, mørkt eller system), forlate og slette prosjekt. |

### Regler

- Tre ulike personer holdes adskilt. **Registrert av** settes av serveren og kan ikke endres. **Ansvarlig** gjelder oppgaver, og **Betalt av / mottatt av** gjelder poster.
- Beløp lagres som heltall i hundredeler av regnskapsvalutaen. For poster i en annen valuta lagres også originalbeløp, valuta og kursen som ble brukt, så summene ikke endrer seg når kursene gjør det.
- Du skriver beløpet uten fortegn, og typen avgjør om det er en utgift eller en inntekt. Lønn kan registreres som begge deler.
- Måneden en post tilhører regnes ut i databasen fra datoen. Endres datoen, flyttes posten automatisk til riktig måned.
- **Budsjett** og **saldo** holdes adskilt. Budsjettet er planlagt forbruk per måned. Startsaldoen for en måned er prosjektets startsaldo pluss resultatet i alle tidligere måneder.
- Tema følger systemet som standard. Du kan bytte manuelt, og valget huskes i nettleseren.

## Sikkerhet

All tilgang styres med radnivåsikkerhet (RLS) i Postgres, se [`supabase/migrations`](supabase/migrations):

- Bare medlemmer av et prosjekt kan lese eller endre prosjektets oppgaver, poster, budsjetter og invitasjoner.
- Du ser bare profilene til personer du deler prosjekt med.
- Invitasjoner kan bare godtas av en innlogget bruker med **bekreftet** e-postadresse som samsvarer med invitasjonen.
- Bare eiere kan gi prosjektet nytt navn, endre startsaldo, endre roller, fjerne andre medlemmer og slette prosjektet. Et prosjekt har alltid minst én eier.
- Anonyme brukere har ingen tilgang til tabellene. Tilgangshjelperne ligger i et eget skjema som ikke er eksponert i API-et.

Den publiserbare Supabase-nøkkelen i `src/config.ts` er laget for å ligge i nettleseren.

## Utvikling

```bash
npm install
npm run dev          # http://localhost:5173 mot Supabase-prosjektet
npm run build        # statiske filer i dist/
```

Appen bruker hash-ruting (`#/p/...`), så `dist/` kan legges på hvilken som helst statisk vert. Du kan peke den mot en annen Supabase med `VITE_SUPABASE_URL` og `VITE_SUPABASE_PUBLISHABLE_KEY`.

### Tester

```bash
npm test             # Vitest: beløp, datoer, månedssummer, saldo, budsjett, filtrering og sortering
npm run test:db      # Migrasjonene og alle tilgangsreglene mot en midlertidig Postgres 16
npm run stack        # Lokal Supabase-stakk: Postgres + Supabase Auth + PostgREST på :54321
npm run test:e2e     # Playwright mot den lokale stakken: konto, prosjekt, oppgaver, økonomi,
                     # budsjett, datoflytting, invitasjon, tilgang for utenforstående, tema og utlogging
npm run stack:stop
```

`npm run stack` laster ned PostgREST og Supabase Auth fra GitHub første gang og krever Postgres 16 (`/usr/lib/postgresql/16`).

## Struktur

```
src/
  lib/        domene (money, dates, finance, tasks), Supabase-klient og API
  state/      innlogging, prosjektdata og meldinger
  ui/         layout, sider og komponenter; styles.css er designsystemet (lyst og mørkt)
supabase/
  migrations/ skjema, RLS-regler og RPC-er
  tests/      tilgangstester i SQL
e2e/          lokal stakk og Playwright-tester
```
