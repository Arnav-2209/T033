import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

function getSeedPassword(): string {
  const value = process.env.SGRS_SEED_PASSWORD;
  if (!value) throw new Error('Set SGRS_SEED_PASSWORD to the local synthetic seed password.');
  return value;
}

const password = getSeedPassword();

const accounts = [
  {
    role: 'Student',
    email: 'aditi.rao@student.demo.sgrs.local',
    route: '/app/student',
    heading: 'Your concerns, clearly tracked.',
  },
  {
    role: 'Handler',
    email: 'ramesh.kumar@staff.demo.sgrs.local',
    route: '/app/handler',
    heading: 'The cases routed to you.',
  },
  {
    role: 'Reviewer',
    email: 'hostel.committee@staff.demo.sgrs.local',
    route: '/app/reviewer',
    heading: 'Cases requiring your review.',
  },
  {
    role: 'Administrator',
    email: 'admin@demo.sgrs.local',
    route: '/app/admin',
    heading: 'Keep the process clear and accountable.',
  },
  {
    role: 'Management',
    email: 'management@demo.sgrs.local',
    route: '/app/management',
    heading: 'See the shape of resolution.',
  },
] as const;

function accountFor(role: (typeof accounts)[number]['role']): (typeof accounts)[number] {
  const account = accounts.find((candidate) => candidate.role === role);
  if (!account) throw new Error(`Missing synthetic account for ${role}.`);
  return account;
}

async function signIn(page: Page, email: string): Promise<void> {
  const account = accounts.find((candidate) => candidate.email === email);
  if (!account) throw new Error(`No E2E role route is registered for ${email}.`);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`${account.route.replaceAll('/', '\\/')}$`));
  await expect(page.getByRole('heading', { name: account.heading })).toBeVisible();
}

test.describe('role entry and route boundaries', () => {
  for (const account of accounts) {
    test(`${account.role} receives the server-authorized workspace`, async ({ page }) => {
      await signIn(page, account.email);
      await expect(page).toHaveURL(new RegExp(`${account.route.replaceAll('/', '\\/')}$`));
      await expect(page.getByRole('heading', { name: account.heading })).toBeVisible();
      const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(accessibility.violations, `${account.role} accessibility violations`).toEqual([]);
    });
  }

  test('a student cannot enter an administrator route by URL', async ({ page }) => {
    await signIn(page, accountFor('Student').email);
    await page.goto('/app/admin/users');
    await expect(page).toHaveURL(/\/app\/student$/);
    await expect(page.getByRole('heading', { name: accountFor('Student').heading })).toBeVisible();
  });

  test('the public story supports keyboard entry into the single sign-in flow', async ({
    page,
  }) => {
    // Audit a stable, fully visible state. The landing page has intentional Motion
    // entrance/reveal effects; scanning while those elements are at partial opacity
    // makes axe report transient contrast ratios that users do not encounter once
    // the animation completes. Reduced motion also exercises the accessible variant.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    ).toBe(true);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'A concern deserves a clear path forward.' }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.locator('.landing-story__intro > .eyebrow').evaluate((element) => {
          return getComputedStyle(element).opacity;
        }),
      )
      .toBe('1');
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations, 'public landing accessibility violations').toEqual([]);
    await page.getByRole('link', { name: 'Account sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  });

  test('public content remains available at mobile/tablet/desktop widths and with reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#how-it-works');
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByRole('heading', { name: 'From first report to considered response.' }),
      ).toBeVisible();
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
      expect(fits, `horizontal overflow at ${width}px`).toBe(true);
    }
  });
});

function incidentDate(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

async function createHostelGrievance(page: Page, title: string): Promise<string> {
  await page.getByRole('link', { name: 'Start a grievance' }).click();
  await page.getByLabel('Title').fill(title);
  await page
    .getByLabel('Description')
    .fill('A synthetic end-to-end case for the SGRS release checks.');
  await page.getByLabel('Category').selectOption({ label: 'Hostel/Infrastructure' });
  await page.getByLabel('Incident date').fill(incidentDate());
  await page.getByRole('button', { name: 'Submit grievance' }).click();
  await expect(page.getByRole('heading', { name: 'Your concern has a reference.' })).toBeVisible();
  const casePath = await page
    .getByRole('link', { name: /view case history/i })
    .getAttribute('href');
  if (!casePath) throw new Error('Submission did not return a case history link.');
  return casePath;
}

test('student and handler complete the information request, resolution and feedback cycle', async ({
  page,
}) => {
  const title = `E2E information flow ${Date.now()}`;
  const internalRemark = `staff-only-${Date.now()}`;
  const studentReply = `student-response-${Date.now()}`;
  await signIn(page, accountFor('Student').email);
  const casePath = await createHostelGrievance(page, title);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, accountFor('Handler').email);
  await page.goto(casePath.replace('/app/student/', '/app/handler/'));
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start investigation' }).click();
  await expect(page.getByRole('heading', { name: 'Under review' })).toBeVisible();
  await page.getByLabel('Internal investigation remark').fill(internalRemark);
  await page.getByRole('button', { name: 'Add internal remark' }).click();
  await expect(
    page.locator('.message-timeline').getByText(internalRemark, { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Internal investigation remark')).toHaveValue('');
  await page
    .getByLabel('Request information from student')
    .fill('Please provide the missing visit date.');
  await page.getByRole('button', { name: 'Send information request' }).click();
  await expect(
    page.locator('.message-timeline').getByText('Please provide the missing visit date.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, accountFor('Student').email);
  await page.goto(casePath);
  await expect(
    page.locator('.message-timeline').getByText('Please provide the missing visit date.'),
  ).toBeVisible();
  await expect(page.getByText(internalRemark, { exact: true })).toHaveCount(0);
  await page.locator('.workflow-panel textarea').fill(studentReply);
  await page.getByRole('button', { name: 'Send response' }).click();
  await expect(
    page.locator('.message-timeline').getByText(studentReply, { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, accountFor('Handler').email);
  await page.goto(casePath.replace('/app/student/', '/app/handler/'));
  await page
    .getByLabel('Resolution remarks')
    .fill('The concern was reviewed and addressed for this synthetic test.');
  await page.getByRole('button', { name: 'Resolve grievance' }).click();
  await expect(
    page
      .locator('.resolution-list')
      .getByText('The concern was reviewed and addressed for this synthetic test.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, accountFor('Student').email);
  await page.goto(casePath);
  await page.getByLabel('Rating').selectOption('5');
  await page.getByLabel('Comment (optional)').fill('The next steps were clear.');
  await page.getByRole('button', { name: 'Submit feedback and close case' }).click();
  await expect(page.getByRole('heading', { name: 'Closed' })).toBeVisible();
  await expect(page.getByText('Resolved → Closed')).toBeVisible();
  await expect(page.getByText('Student feedback · 5/5')).toBeVisible();
});

test('handler escalation reaches the assigned reviewer and reviewer resolution is visible to the student', async ({
  page,
}) => {
  const title = `E2E reviewer flow ${Date.now()}`;
  await signIn(page, accountFor('Student').email);
  const studentCasePath = await createHostelGrievance(page, title);
  const handlerCasePath = studentCasePath.replace('/app/student/', '/app/handler/');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, accountFor('Handler').email);
  await page.goto(handlerCasePath);
  await page.getByRole('button', { name: 'Start investigation' }).click();
  await expect(page.getByRole('heading', { name: 'Under review' })).toBeVisible();
  await page
    .getByLabel('Reason for manual escalation')
    .fill('Needs committee review for the synthetic test.');
  await page.getByRole('button', { name: 'Escalate to reviewer' }).click();
  await expect(page.getByRole('heading', { name: 'Escalated' })).toBeVisible();

  const reviewerCasePath = studentCasePath.replace('/app/student/', '/app/reviewer/');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, accountFor('Reviewer').email);
  await page.goto(reviewerCasePath);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Begin reviewer handling' }).click();
  await expect(page.getByLabel('Direction for the handler')).toBeVisible();
  await page
    .getByLabel('Resolution remarks')
    .fill('The committee reviewed and addressed this synthetic concern.');
  await page.getByRole('button', { name: 'Resolve grievance' }).click();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, accountFor('Student').email);
  await page.goto(studentCasePath);
  await expect(
    page
      .locator('.resolution-list')
      .getByText('The committee reviewed and addressed this synthetic concern.'),
  ).toBeVisible();
  await page.getByLabel('Rating').selectOption('4');
  await page.getByRole('button', { name: 'Submit feedback and close case' }).click();
  await expect(page.getByRole('heading', { name: 'Closed' })).toBeVisible();
  await expect(page.getByText('Resolved → Closed')).toBeVisible();
});
