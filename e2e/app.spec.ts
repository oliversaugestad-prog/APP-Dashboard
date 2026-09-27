import { expect, test, type Browser, type Page } from '@playwright/test';

// Ende-til-ende: to brukere samarbeider i ett prosjekt, en tredje skal ikke se noe.
// Krever lokal stakk: `e2e/stack.sh start` (Postgres + Supabase Auth + PostgREST).

const run = Date.now().toString(36);
const anna = { name: 'Anna Arrangør', email: `anna-${run}@test.no`, password: 'Passord-anna-1' };
const bjorn = { name: 'Bjørn Budsjett', email: `bjorn-${run}@test.no`, password: 'Passord-bjorn-1' };
const cato = { name: 'Cato Utenfor', email: `cato-${run}@test.no`, password: 'Passord-cato-1' };

let projectUrl = '';

async function signUp(browser: Browser, user: typeof anna): Promise<Page> {
  const page = await browser.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Opprett konto' }).first().click();
  await page.getByLabel('Navn').fill(user.name);
  await page.getByLabel('E-post').fill(user.email);
  await page.getByLabel('Passord').fill(user.password);
  await page.getByRole('button', { name: 'Opprett konto' }).last().click();
  await expect(page.getByRole('heading', { name: 'Mine prosjekter' })).toBeVisible();
  return page;
}

/** Åpner kategorivelgeren, skriver navnet og trykker Enter (velger eksisterende eller oppretter ny). */
async function pickCategory(page: Page, trigger: ReturnType<Page['getByRole']>, name: string) {
  await trigger.click();
  const box = page.locator('.popover').getByRole('combobox');
  await box.fill(name);
  await box.press('Enter');
  await expect(page.locator('.popover')).toBeHidden();
}

async function openDialogAndFillTask(
  page: Page,
  fields: { title: string; description?: string; category?: string; due?: string; kind?: 'Oppgave' | 'Idé'; assignee?: string },
) {
  await page
    .getByRole('button', { name: /Ny( oppgave)?$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  if (fields.kind) await dialog.getByRole('button', { name: fields.kind, exact: true }).click();
  await dialog.getByLabel('Tittel').fill(fields.title);
  if (fields.description) await dialog.getByLabel('Kort beskrivelse').fill(fields.description);
  if (fields.category) await pickCategory(page, dialog.getByRole('button', { name: /^Kategori eller etikett:/ }), fields.category);
  if (fields.due) await dialog.getByLabel('Forfallsdato').fill(fields.due);
  if (fields.assignee) await dialog.getByLabel('Ansvarlig').selectOption({ label: fields.assignee });
  await dialog.getByRole('button', { name: 'Lagre' }).click();
  await expect(dialog).toBeHidden();
}

async function addTransaction(
  page: Page,
  t: { type: 'Utgift' | 'Inntekt'; name: string; amount: string; date: string; category: string; person?: string; note?: string },
) {
  await page
    .getByRole('button', { name: /^Ny( post)?$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: t.type, exact: true }).click();
  await dialog.getByLabel('Navn eller beskrivelse').fill(t.name);
  await dialog.getByLabel('Beløp (NOK)').fill(t.amount);
  await dialog.getByLabel('Dato').fill(t.date);
  await pickCategory(page, dialog.getByRole('button', { name: /^Kategori:/ }), t.category);
  if (t.person) await dialog.getByLabel(t.type === 'Utgift' ? 'Hvem betalte?' : 'Hvem mottok?').selectOption({ label: t.person });
  if (t.note) await dialog.getByLabel('Notat (valgfritt)').fill(t.note);
  await dialog.getByRole('button', { name: 'Registrer' }).click();
  await expect(dialog).toBeHidden();
}

test.describe.serial('Prosjektpanel', () => {
  test('Anna oppretter konto og prosjekt', async ({ browser }) => {
    const page = await signUp(browser, anna);
    await expect(page.getByText(`Logget inn som ${anna.email}`)).toBeVisible();
    await page.getByLabel('Navn', { exact: true }).fill('Sommerfest');
    await page.getByLabel('Startsaldo (valgfritt)').fill('1 000');
    await page.getByRole('button', { name: 'Opprett prosjekt' }).click();
    await expect(page.getByRole('heading', { name: 'Oppgaver', level: 1 })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Velg prosjekt' })).toHaveValue(/.+/);
    projectUrl = page.url().replace(/\/oppgaver$/, '');
    await page.close();
  });

  test('oppgaver: opprette, filtrere, fullføre og gjøre idé om til oppgave', async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    await page.getByLabel('E-post').fill(anna.email);
    await page.getByLabel('Passord').fill(anna.password);
    await page.getByRole('button', { name: 'Logg inn' }).last().click();
    await expect(page.getByRole('heading', { name: 'Oppgaver', level: 1 })).toBeVisible();

    await openDialogAndFillTask(page, { title: 'Booke lokale', description: 'Ring tre steder', category: 'Lokaler', due: '2026-10-05', assignee: anna.name });
    await openDialogAndFillTask(page, { title: 'Lage plakat', category: 'Markedsføring', due: '2026-09-20' });
    await openDialogAndFillTask(page, { title: 'Fyrverkeri?', kind: 'Idé', description: 'Sjekk regler' });

    const rows = page.locator('tbody tr:not(.add-row):not(.empty-row)');
    await expect(rows).toHaveCount(3);
    // Sortert etter frist: plakat (20.9) før lokale (5.10), idé uten frist sist.
    await expect(rows.nth(0)).toContainText('Lage plakat');
    await expect(rows.nth(2)).toContainText('Fyrverkeri?');
    await expect(page.getByText('Forfalt').first()).toBeVisible();

    // Visninger
    await page.getByRole('button', { name: /Mine oppgaver/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Booke lokale');
    await page.getByRole('button', { name: /Ideer/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Fyrverkeri?');

    // Idé → oppgave
    await page.getByRole('button', { name: 'Gjør til oppgave' }).click();
    await expect(page.getByText('«Fyrverkeri?» er nå en oppgave.')).toBeVisible();
    await expect(rows).toHaveCount(0);

    // Fullføre og filtrere på status og kategori
    await page.getByRole('button', { name: /^Alle/ }).click();
    await page.getByRole('checkbox', { name: 'Fullfør «Lage plakat»' }).check();
    await expect(page.getByText('Oppgaven er fullført.')).toBeVisible();
    await page.getByLabel('Status', { exact: true }).selectOption('done');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Lage plakat');
    await page.getByRole('button', { name: 'Nullstill' }).click();
    await page.getByLabel('Kategori', { exact: true }).selectOption('Lokaler');
    await expect(rows).toHaveCount(1);
    await page.getByRole('button', { name: 'Nullstill' }).click();

    // Sortering på tittel
    await page.getByRole('button', { name: 'Tittel', exact: true }).click();
    await expect(rows.nth(0)).toContainText('Booke lokale');

    // Rask statusendring
    await page.getByLabel('Status for «Booke lokale»').selectOption('in_progress');
    await expect(page.getByText('Status: Pågår.')).toBeVisible();

    // Redigere i dialogen
    await page.getByRole('button', { name: 'Åpne «Booke lokale»' }).click();
    await page.getByRole('dialog').getByLabel('Tittel').fill('Booke festlokale');
    await page.getByRole('dialog').getByRole('button', { name: 'Lagre' }).click();
    await expect(page.getByRole('button', { name: /^Tittel: Booke festlokale/ })).toBeVisible();

    // Redigere direkte i tabellen: tittel, beskrivelse, kategori, ansvarlig, frist og type
    await page.getByRole('button', { name: /^Tittel: Lage plakat/ }).click();
    await page.getByRole('textbox', { name: 'Tittel' }).fill('Lage plakat og flyer');
    await page.getByRole('textbox', { name: 'Tittel' }).press('Enter');
    await expect(page.getByRole('button', { name: /^Tittel: Lage plakat og flyer/ })).toBeVisible();
    const plakat = rows.filter({ hasText: 'Lage plakat og flyer' });
    await plakat.getByRole('button', { name: /^Beskrivelse:/ }).click();
    await page.getByRole('textbox', { name: 'Beskrivelse' }).fill('A3 og A5');
    await page.getByRole('textbox', { name: 'Beskrivelse' }).press('Enter');
    await expect(plakat).toContainText('A3 og A5');
    // Tidligere brukt kategori kan velges igjen
    await plakat.getByRole('button', { name: /^Kategori for/ }).click();
    await expect(page.locator('.popover').getByText('Lokaler')).toBeVisible();
    await page
      .locator('.popover')
      .getByRole('option', { name: /Lokaler/ })
      .click();
    await expect(plakat.getByRole('button', { name: /^Kategori for.*: Lokaler/ })).toBeVisible();
    await plakat.getByLabel(/^Ansvarlig for/).selectOption({ label: anna.name });
    await expect(plakat).toContainText(anna.name);
    await plakat.getByLabel(/^Type for/).selectOption('idea');
    await expect(page.getByText('er nå en idé.')).toBeVisible();
    await plakat.getByLabel(/^Type for/).selectOption('task');
    // Nytt navn på kategori endrer alle oppgaver
    await plakat.getByRole('button', { name: /^Kategori for/ }).click();
    await page.getByRole('button', { name: 'Rediger Lokaler' }).click();
    await page.getByLabel('Nytt navn for Lokaler').fill('Lokale og scene');
    await page.locator('.popover').getByRole('button', { name: 'Lagre' }).click();
    await expect(page.getByText('Kategorien heter nå «Lokale og scene».')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(rows.filter({ hasText: 'Lokale og scene' })).toHaveCount(2);

    // «+ Ny oppgave» nederst i tabellen
    await page.getByRole('button', { name: 'Ny oppgave', exact: true }).last().click();
    await page.getByLabel('Ny oppgave: tittel').fill('Kjøpe kopper');
    await page.getByLabel('Ny oppgave: tittel').press('Enter');
    await expect(rows.filter({ hasText: 'Kjøpe kopper' })).toHaveCount(1);
    await page.getByLabel('Ny oppgave: tittel').press('Escape');

    // Ansvar per person
    await page.getByRole('link', { name: 'Ansvar per person' }).first().click();
    const annaCard = page.locator('section', { has: page.getByRole('heading', { name: anna.name }) });
    await expect(annaCard.getByText('Booke festlokale')).toBeVisible();
    await page.getByLabel('Vis fullførte i listene').check();
    await expect(annaCard.getByText('Lage plakat og flyer')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Uten ansvarlig' })).toBeVisible();
    await page.close();
  });

  test('egne egenskaper (kolonner) som i Notion', async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    await page.getByLabel('E-post').fill(anna.email);
    await page.getByLabel('Passord').fill(anna.password);
    await page.getByRole('button', { name: 'Logg inn' }).last().click();
    await page.goto(`${projectUrl}/oppgaver`);
    const row = page.locator('tbody tr', { hasText: 'Booke festlokale' });

    const addProp = async (name: string, type: string) => {
      await page.getByRole('button', { name: 'Legg til egenskap' }).click();
      await page.getByLabel('Navn på egenskapen').fill(name);
      await page.getByRole('radio', { name: type, exact: true }).click();
      await page.getByRole('button', { name: 'Legg til', exact: true }).click();
      await expect(page.getByText(`Egenskapen «${name}» er lagt til.`)).toBeVisible();
    };

    // Tall
    await addProp('Timer', 'Tall');
    await row.getByRole('button', { name: /^Timer for «Booke festlokale»/ }).click();
    await page.getByRole('textbox', { name: 'Timer for «Booke festlokale»' }).fill('2,5');
    await page.getByRole('textbox', { name: 'Timer for «Booke festlokale»' }).press('Enter');
    await expect(row.getByRole('button', { name: /^Timer for «Booke festlokale»: 2,5/ })).toBeVisible();

    // Valg: opprett en ny verdi med farge
    await addProp('Sted', 'Valg');
    await row.getByRole('button', { name: /^Sted for/ }).click();
    await page.locator('.popover').getByRole('combobox').fill('Oslo');
    await page.locator('.popover').getByRole('combobox').press('Enter');
    await expect(row.getByRole('button', { name: /^Sted for.*: Oslo/ })).toBeVisible();

    // Flervalg: to verdier
    await addProp('Utstyr', 'Flervalg');
    await row.getByRole('button', { name: /^Utstyr for/ }).click();
    const combo = page.locator('.popover').getByRole('combobox');
    await combo.fill('Lyd');
    await combo.press('Enter');
    await combo.fill('Lys');
    await combo.press('Enter');
    await page.keyboard.press('Escape');
    await expect(row.getByRole('button', { name: /^Utstyr for.*: Lyd, Lys/ })).toBeVisible();

    // Avkrysning
    await addProp('Bekreftet', 'Avkrysning');
    await row.getByRole('checkbox', { name: /^Bekreftet for/ }).check();
    await expect(row.getByRole('checkbox', { name: /^Bekreftet for/ })).toBeChecked();

    // Verdiene lagres i databasen og vises etter omlasting og i oppgavevinduet
    await page.reload();
    await expect(row.getByRole('button', { name: /^Timer for.*: 2,5/ })).toBeVisible();
    await expect(row.getByRole('checkbox', { name: /^Bekreftet for/ })).toBeChecked();
    await page.getByRole('button', { name: 'Åpne «Booke festlokale»' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Egenskaper')).toContainText('Timer');
    await expect(dialog.getByRole('button', { name: /^Sted for.*: Oslo/ })).toBeVisible();
    await page.keyboard.press('Escape');

    // Kolonnemeny: sortering, nytt navn, skjul og slett
    const rows = page.locator('tbody tr:not(.add-row):not(.empty-row)');
    await page.getByRole('button', { name: /^Egenskap Timer/ }).click();
    await page.getByRole('button', { name: 'Sorter synkende' }).click();
    await expect(rows.first()).toContainText('Booke festlokale');
    await page.getByRole('button', { name: /^Egenskap Timer/ }).click();
    await page.getByRole('button', { name: 'Gi nytt navn' }).click();
    await page.getByLabel('Navn på egenskapen').fill('Timer brukt');
    await page.getByRole('button', { name: 'Lagre' }).click();
    await expect(page.getByRole('button', { name: /^Egenskap Timer brukt/ })).toBeVisible();

    await page.getByRole('button', { name: /^Egenskap Bekreftet/ }).click();
    await page.getByRole('button', { name: 'Skjul i visningen' }).click();
    await expect(page.getByRole('button', { name: /^Egenskap Bekreftet/ })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: /^Egenskap Bekreftet/ })).toHaveCount(0);
    await page.getByRole('button', { name: /^Egenskaper/ }).click();
    await page.getByLabel('Vis Bekreftet').check();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Egenskap Bekreftet/ })).toBeVisible();

    await page.getByRole('button', { name: /^Egenskap Utstyr/ }).click();
    await page.getByRole('button', { name: 'Slett egenskap' }).click();
    await page.getByRole('button', { name: 'Slett', exact: true }).click();
    await expect(page.getByText('«Utstyr» er slettet.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Egenskap Utstyr/ })).toHaveCount(0);
    await page.close();
  });

  test('gjentakende oppgaver og kalender', async ({ browser }) => {
    const page = await browser.newPage();
    // Fast «nå» midt i uke 40, så testen ikke avhenger av dagens dato.
    await page.clock.setFixedTime(new Date('2026-09-30T10:00:00'));
    await page.goto('/');
    await page.getByLabel('E-post').fill(anna.email);
    await page.getByLabel('Passord').fill(anna.password);
    await page.getByRole('button', { name: 'Logg inn' }).last().click();
    await page.goto(`${projectUrl}/oppgaver`);

    // Lag en ukentlig oppgave med frist mandag 5. oktober.
    await page
      .getByRole('button', { name: /^Ny( oppgave)?$/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Tittel').fill('Ukesrapport');
    await dialog.getByLabel('Forfallsdato').fill('2026-10-05');
    await dialog.getByLabel('Gjentakelse').selectOption('weekly');
    await expect(dialog.getByRole('button', { name: 'mandag' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByText('Hver uke (man)')).toBeVisible();
    await dialog.getByRole('button', { name: 'Lagre' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: /^Gjentakende/ }).click();
    const rows = page.locator('tbody tr:not(.add-row):not(.empty-row)');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Ukesrapport');
    await expect(rows.first().getByLabel('Gjentakende')).toBeVisible();

    // Fullfør: neste forekomst lages automatisk med frist 12. oktober.
    await page.getByRole('button', { name: /^Alle/ }).click();
    await page.getByRole('checkbox', { name: 'Fullfør «Ukesrapport»' }).check();
    await expect(page.getByText('Fullført. Neste forekomst er lagt til.')).toBeVisible();
    const series = page.locator('tbody tr', { hasText: 'Ukesrapport' });
    await expect(series).toHaveCount(2);
    await expect(page.getByRole('checkbox', { name: 'Fullfør «Ukesrapport»' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Frist for «Ukesrapport»: 2026-10-12/ })).toBeVisible();

    // Kalenderen: ny hendelse via knappen
    await page.getByRole('link', { name: 'Kalender' }).first().click();
    await expect(page.getByText('Uke 40')).toBeVisible();
    await page
      .getByRole('button', { name: /^Ny( hendelse)?$/ })
      .first()
      .click();
    const ev = page.getByRole('dialog');
    await ev.getByLabel('Tittel').fill('Styremøte');
    await ev.getByLabel('Fra dato').fill('2026-10-06');
    await ev.getByLabel('Fra kl.').fill('10:00');
    await ev.getByLabel('Til kl.').fill('11:00');
    await ev.getByRole('button', { name: 'Lagre' }).click();
    await expect(page.getByText('Hendelsen er lagt i kalenderen.')).toBeVisible();

    // Neste uke: hendelsen og oppgavens frist vises
    await page.getByRole('button', { name: 'Neste', exact: true }).click();
    await expect(page.getByText('Uke 41')).toBeVisible();
    const chip = page.getByRole('button', { name: /^Styremøte/ }).first();
    await expect(chip).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ukesrapport' }).first()).toBeVisible();

    // Boblen viser detaljene
    await chip.click();
    const pop = page.getByRole('dialog', { name: 'Styremøte' });
    await expect(pop).toContainText('10:00–11:00');
    await expect(pop).toContainText('Møte');
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();

    // Dra hendelsen én time ned
    const box = (await chip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 8 + 22, { steps: 4 });
    await page.mouse.move(box.x + box.width / 2, box.y + 8 + 44, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: /^Styremøte.*11:00–12:00/ })).toBeVisible();

    // Kommende forekomst av den gjentakende oppgaven i uken etter
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('Uke 42')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ukesrapport' }).first()).toBeVisible();
    await page.keyboard.press('t');
    await expect(page.getByText('Uke 40')).toBeVisible();

    // Måned, og skjul en kilde i sidepanelet
    await page.keyboard.press('m');
    await page.getByRole('button', { name: 'Neste', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Oktober 2026' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Styremøte/ }).first()).toBeVisible();
    await page.getByRole('button', { name: /^Møte/ }).click();
    await expect(page.getByRole('button', { name: /Styremøte/ })).toHaveCount(0);
    await page.getByRole('button', { name: /^Møte/ }).click();
    await expect(page.getByRole('button', { name: /Styremøte/ }).first()).toBeVisible();
    await page.keyboard.press('u');
    await page.close();
  });

  test('økonomi: poster, budsjett, måneder og datoflytting', async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    await page.getByLabel('E-post').fill(anna.email);
    await page.getByLabel('Passord').fill(anna.password);
    await page.getByRole('button', { name: 'Logg inn' }).last().click();
    await page.goto(`${projectUrl}/okonomi`);
    await expect(page.getByRole('heading', { name: 'Økonomi', level: 1 })).toBeVisible();

    await addTransaction(page, {
      type: 'Utgift',
      name: 'Leie av lokale',
      amount: '2 500,00',
      date: '2026-09-15',
      category: 'Lokaler',
      person: anna.name,
      note: 'Depositum inkludert',
    });
    await addTransaction(page, { type: 'Inntekt', name: 'Billettsalg', amount: '10000', date: '2026-09-20', category: 'Billetter', person: anna.name });
    await addTransaction(page, { type: 'Utgift', name: 'Lønn DJ', amount: '1.500', date: '2026-09-21', category: 'Lønn', person: 'Ingen / prosjektet' });

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(page.locator('.metric', { hasText: 'Inntekter' })).toContainText('10 000,00 kr');
    await expect(page.locator('.metric', { hasText: 'Utgifter' })).toContainText('4 000,00 kr');
    await expect(page.locator('.metric', { hasText: 'Resultat' })).toContainText('+6 000,00 kr');
    await expect(page.locator('.metric', { hasText: 'Saldo nå' })).toContainText('7 000,00 kr');

    // Filtrering og gruppering
    await page.getByLabel('Type', { exact: true }).selectOption('expense');
    await expect(rows).toHaveCount(2);
    await page.getByLabel('Grupper etter').selectOption('category');
    await expect(page.locator('tr.group-row')).toHaveCount(2);
    await page.getByRole('button', { name: 'Nullstill' }).click();
    await page.getByLabel('Grupper etter').selectOption('none');

    // Månedsoversikt og budsjett
    await page.getByRole('link', { name: 'Måneder' }).click();
    const sep = page.locator('section.month-card', { has: page.getByRole('heading', { name: 'September 2026' }) });
    await expect(sep).toContainText('Ikke noe budsjett satt');
    await sep.getByRole('button', { name: 'Sett budsjett' }).click();
    await page.getByRole('dialog').getByLabel('Utgiftsbudsjett (NOK)').fill('3 000');
    await page.getByRole('dialog').getByRole('button', { name: 'Lagre budsjett' }).click();
    await expect(sep).toContainText('Over budsjett');
    await expect(sep).toContainText('Budsjett overskredet med');
    await expect(sep).toContainText('1 000,00 kr');
    await expect(sep).toContainText('133 % brukt');
    await expect(sep).toContainText('Saldo ved månedsslutt');
    await expect(sep).toContainText('7 000,00 kr');

    // Detaljvisning
    await sep.getByRole('link', { name: 'September 2026', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'September 2026', level: 1 })).toBeVisible();
    const calc = page.locator('.calc');
    await expect(calc).toContainText('Startsaldo');
    await expect(calc).toContainText('1 000,00 kr');
    await expect(calc).toContainText('7 000,00 kr');
    await expect(page.locator('tr.group-row')).toHaveCount(2); // gruppert på type som standard
    await page.getByLabel('Person').selectOption('none');
    await expect(page.locator('tbody tr:not(.group-row)')).toHaveCount(1);
    await page.getByRole('button', { name: 'Nullstill' }).click();

    // Flytt leien til oktober: september oppdateres og oktober får posten.
    await page.getByRole('button', { name: 'Leie av lokale' }).click();
    await page.getByRole('dialog').getByLabel('Dato').fill('2026-10-02');
    await page.getByRole('dialog').getByRole('button', { name: 'Lagre' }).click();
    await expect(page.getByText('Lagret og flyttet til oktober 2026.')).toBeVisible();
    await expect(page.locator('.calc')).toContainText('9 500,00 kr');
    await page.getByRole('link', { name: 'Oktober 2026' }).click();
    await expect(page.getByRole('heading', { name: 'Oktober 2026', level: 1 })).toBeVisible();
    await expect(page.locator('.calc')).toContainText('9 500,00 kr'); // startsaldo = forrige sluttsaldo
    await expect(page.locator('.calc')).toContainText('7 000,00 kr'); // sluttsaldo
    await page.getByRole('link', { name: /Tilbake til månedsoversikten/ }).click();
    const sep2 = page.locator('section.month-card', { has: page.getByRole('heading', { name: 'September 2026' }) });
    await expect(sep2).not.toContainText('Over budsjett');
    await expect(sep2).toContainText('Igjen av budsjettet');
    await expect(sep2).toContainText('1 500,00 kr');
    await page.close();
  });

  test('invitasjon: Bjørn blir med og registrerer en utgift', async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    await page.getByLabel('E-post').fill(anna.email);
    await page.getByLabel('Passord').fill(anna.password);
    await page.getByRole('button', { name: 'Logg inn' }).last().click();
    await page.goto(`${projectUrl}/innstillinger`);
    await page.getByLabel('E-postadresse').fill(bjorn.email.toUpperCase());
    await page.getByLabel('Ansvar for økonomi').last().check();
    await page.getByRole('button', { name: 'Inviter' }).click();
    await expect(page.getByText('Venter på svar')).toBeVisible();
    await expect(page.getByText(bjorn.email).first()).toBeVisible();

    const b = await signUp(browser, bjorn);
    await expect(b.getByRole('heading', { name: 'Invitasjoner' })).toBeVisible();
    await expect(b.getByText('Sommerfest')).toBeVisible();
    await expect(b.getByText(`Invitert av ${anna.name}`)).toBeVisible();
    await b.getByRole('button', { name: 'Bli med' }).click();
    await expect(b.getByRole('heading', { name: 'Oppgaver', level: 1 })).toBeVisible();
    await expect(b.getByRole('button', { name: /^Tittel: Booke festlokale/ })).toBeVisible();

    await b.goto(`${projectUrl}/okonomi`);
    await addTransaction(b, { type: 'Utgift', name: 'Drikke', amount: '899,90', date: '2026-09-26', category: 'Mat og drikke', person: bjorn.name });
    const row = b.locator('tbody tr', { hasText: 'Drikke' });
    await expect(row).toContainText('−899,90 kr');
    await expect(row).toContainText(bjorn.name); // registrert av

    // Per person: hvem har betalt hva
    await b.getByRole('link', { name: 'Per person', exact: true }).click();
    await expect(b.getByRole('heading', { name: 'Betalinger per person', level: 1 })).toBeVisible();
    const table = b.locator('table');
    await expect(table.locator('tr', { hasText: bjorn.name })).toContainText('899,90 kr');
    await expect(table.locator('tr', { hasText: anna.name })).toContainText('2 500,00 kr');
    await expect(table.locator('tr', { hasText: anna.name })).toContainText('10 000,00 kr');
    await expect(table.locator('tfoot')).toContainText('4 899,90 kr');
    await b.getByLabel('Periode').selectOption({ label: 'September 2026' });
    await expect(table.locator('tr', { hasText: anna.name })).toContainText('0,00 kr');
    await expect(table.locator('tfoot')).toContainText('2 399,90 kr');

    // Anna ser Bjørn som medlem med økonomiansvar
    await page.reload();
    const bRow = page.locator('li', { hasText: bjorn.email });
    await expect(bRow).toContainText('Medlem');
    await expect(bRow.getByLabel('Ansvar for økonomi')).toBeChecked();

    // Bjørn kan ikke endre prosjektnavn
    await b.goto(`${projectUrl}/innstillinger`);
    await expect(b.getByText('Bare eiere kan endre')).toBeVisible();
    await expect(b.getByLabel('Navn', { exact: true }).first()).toBeDisabled();
    await b.close();
    await page.close();
  });

  test('utenforstående ser ingenting', async ({ browser }) => {
    const c = await signUp(browser, cato);
    await expect(c.getByText('Du er ikke med i noen prosjekter ennå')).toBeVisible();
    await c.goto(`${projectUrl}/oppgaver`);
    await expect(c.getByText('Fant ikke prosjektet')).toBeVisible();
    await c.close();
  });

  test('tema: bytte manuelt og huske valget', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.getByLabel('E-post').fill(anna.email);
    await page.getByLabel('Passord').fill(anna.password);
    await page.getByRole('button', { name: 'Logg inn' }).last().click();
    await page.goto(`${projectUrl}/innstillinger`);
    await page.getByRole('button', { name: 'Mørk', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(5, 7, 12)');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Følg systemet' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    await ctx.close();
  });

  test('logg ut', async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/');
    await page.getByLabel('E-post').fill(anna.email);
    await page.getByLabel('Passord').fill('feil-passord');
    await page.getByRole('button', { name: 'Logg inn' }).last().click();
    await expect(page.getByText('Feil e-post eller passord.')).toBeVisible();
    await page.getByLabel('Passord').fill(anna.password);
    await page.getByRole('button', { name: 'Logg inn' }).last().click();
    await page.goto(`${projectUrl}/innstillinger`);
    await page.getByRole('button', { name: 'Logg ut' }).click();
    await expect(page.getByRole('button', { name: 'Logg inn' }).last()).toBeVisible();
    await page.goto(`${projectUrl}/oppgaver`);
    await expect(page.getByRole('button', { name: 'Logg inn' }).last()).toBeVisible();
    await page.close();
  });
});
