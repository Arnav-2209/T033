# Phase 7 — design system and public story

## Scope

Phase 7 follows the approved M7 gate in the Phase 0 proposal: shared design tokens, a public SGRS landing page, responsive role entry surfaces, one scroll-driven narrative sequence, and keyboard/reduced-motion parity. It extends the existing editorial palette and typography used by the authenticated workspaces. It does not change grievance or authorization business rules.

## Route and role composition

- `/` renders the public landing page while signed out. An authenticated session redirects to the role route returned by the API.
- `/login` remains the single sign-in form. The server derives account role; there is no role selector or public registration path.
- Student, Handler and Reviewer routes retain their dedicated dashboards and queues.
- Administrator and Institute Management retain separate role-home compositions and links. Management copy and reports stay aggregate-only.
- Public calls to action and role navigation point to working destinations. Illustrations are labeled illustrative and contain no fabricated case metrics or case records.

## Design system

The current visual direction is an institute field journal: warm paper and ink form the reading surface, while LNMIIT blue and saffron/orange act as institutional accents. The supplied LNMIIT logo is used as a fixed image asset and is not recolored, redrawn or animated. `apps/web/src/styles.css` defines shared color, typography, focus, line and motion tokens. IBM Plex Sans is the default for forms, role workspaces, cards and operational headings. Newsreader is reserved for selected public/editorial display headings and the illustrative case-file title; it is not applied to every heading. IBM Plex Mono is limited to short folio and reference labels. Font files are bundled locally through Fontsource; the runtime does not request Google Fonts or another font host.

The public hero uses the actual public React Bits Grainient component, adapted with LNMIIT blue, paper, and saffron colors. It uses WebGL2 when supported, has a CSS color fallback, responds gently to pointer movement, and respects reduced motion. The source attribution and MIT + Commons Clause license notice are kept with the component. It is a public component and does not require a paid license; the Commons Clause prohibits selling or redistributing the component itself. Hero copy/artifact entrance uses Motion; the landing process chapter uses GSAP ScrollTrigger to update its persistent SVG progress figure and reveal the introduction. Hover, focus and pressed states use CSS.

The public page is organized as an editorial cover, a case-journey chapter, a five-role index, a sign-in close and a quiet footer. The journey pairs persistent vector artwork with four complete, independently readable chapters. ScrollTrigger updates the diagram's progress line and current caption; it does not hide required content, hijack scrolling or animate real user data. The route and its records are illustrative only. Authenticated pages retain their role-specific information architecture and actions while shared typography, surfaces, case cards and controls receive the same design treatment.

## Accessibility and responsive behavior

- A visible-on-focus skip link targets the main landmark on the public page and authenticated role homes/workspaces.
- Navigation uses links with real destinations; decorative SVG and arrows are hidden from assistive technology.
- Focus-visible styling uses the shared high-contrast ring. Heading and landmark structure is explicit.
- The chapter sequence leaves all explanatory text in the document. When `prefers-reduced-motion: reduce` is set, the GSAP/ScrollTrigger enhancement is not initialized, transitions are removed and the full route diagram remains static. Browsers without `matchMedia` also retain the complete static story.
- Existing workspace breakpoints remain in place. The public composition reflows at 960px, 720px and 420px; narrow layouts stack the hero, role index and story columns, and maintain a compact sticky illustration only while its text remains scrollable.
- There is no scroll hijacking, automatic loop, timed content replacement, or interaction that depends on animation.

## Design implementation boundaries

- `/`, `/login` and five authenticated workspaces share the visual tokens; role-specific sections and permission-sensitive data rendering are untouched.
- The official logo file is `/apps/web/public/lnmiit-logo.png` and its source artwork is preserved.
- React Bits Grainient is adapted only for the public landing hero. Its TechText effect is not used on institutional wordmarks; the college mark must remain exact and readable.
- GSAP is dynamically imported only when the landing story mounts in a browser that supports `matchMedia` and does not request reduced motion. The scroll enhancement is therefore deferred from the initial application bundle.
- All animation is decorative. No control, case status, validation, or navigation depends on animation completion.

## Verification

The frontend suite checks the signed-out public route, working sign-in links, main navigation, story heading, all five role labels and skip-link target. The M8 Playwright suite adds end-to-end role entry, student/handler and reviewer case workflows, axe WCAG checks, reduced-motion availability and 390/768/1440 px overflow assertions. Automated layout checks complement but do not replace manual visual, keyboard and screen-reader review. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm e2e` and `pnpm build` are the release gates.
