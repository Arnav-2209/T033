import { lazy, Suspense, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { LandingStorySequence } from './LandingStorySequence.js';

const Grainient = lazy(() => import('../visual/Grainient.jsx'));

const roles = [
  {
    index: '01',
    title: 'Student',
    copy: 'Submit a concern and follow its history, requests and outcome.',
    note: 'A private case record',
  },
  {
    index: '02',
    title: 'Grievance handler',
    copy: 'Review assigned cases, keep investigation notes and request information.',
    note: 'An assigned queue',
  },
  {
    index: '03',
    title: 'Department reviewer',
    copy: 'Consider cases escalated to the reviewer level assigned to you.',
    note: 'A level-based review',
  },
  {
    index: '04',
    title: 'Administrator',
    copy: 'Maintain accounts, routing configuration, reports and audit history.',
    note: 'A system stewardship role',
  },
  {
    index: '05',
    title: 'Institute management',
    copy: 'Review aggregate oversight reports without access to private case files.',
    note: 'Aggregate oversight',
  },
];

export function PublicLandingPage(): ReactNode {
  const reduceMotion = useReducedMotion();
  return (
    <div className="public-site">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="public-header">
        <Link className="public-brand" to="/">
          <img src="/lnmiit-logo.png" alt="The LNM Institute of Information Technology, Jaipur" />
          <span className="public-brand__rule" aria-hidden="true" />
          <span className="public-wordmark">
            SGRS<span> / STUDENT SERVICES</span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">The process</a>
          <a href="#who-uses-sgrs">Who it serves</a>
          <Link className="button button--quiet" to="/login">
            Account sign in <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>

      <main id="main-content">
        <section className="public-hero" aria-labelledby="public-title">
          <Suspense fallback={<div className="public-hero__grain" aria-hidden="true" />}>
            <Grainient
              className="public-grainient"
              colors={['#f4f1e9', '#c4d9d7', '#327b91', '#d27b50', '#f4f1e9']}
              type="linear"
              angle={28}
              speed={0.62}
              flow={0.9}
              scale={1}
              softness={0.76}
              silk={0.22}
              grainAmount={0.09}
              grainSize={1.1}
              interactive
              stir={2}
              clickSwirl={false}
              intro
              aria-hidden="true"
            />
          </Suspense>
          <motion.div
            className="public-hero__copy"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="eyebrow">LNMIIT JAIPUR · STUDENT GRIEVANCE REDRESSAL</p>
            <h1 id="public-title">A concern deserves a clear path forward.</h1>
            <p className="public-hero__lead">
              A considered way to raise a concern, keep its record together and follow each step
              through the institute.
            </p>
            <div className="public-hero__actions">
              <Link className="button button--primary" to="/login">
                Sign in to your account <span aria-hidden="true">↗</span>
              </Link>
              <a className="text-action" href="#how-it-works">
                Explore the process <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="public-hero__footnote">
              Access is attached to an account created by an administrator. Your role is verified
              when you sign in.
            </p>
          </motion.div>

          <motion.figure
            className="public-hero__artifact"
            aria-label="Illustrative SGRS case file"
            initial={reduceMotion ? false : { opacity: 0, y: 22, rotate: 1.2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.85, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="case-artifact">
              <div className="case-artifact__edge" />
              <div className="case-artifact__heading">
                <span>STUDENT SERVICES</span>
                <span>FILE / 01</span>
              </div>
              <div className="case-artifact__seal" aria-hidden="true">
                <span>S</span>
                <i />
              </div>
              <p className="eyebrow">A RECORD THAT MOVES WITH CARE</p>
              <h2>
                One concern.
                <br />
                One clear record.
              </h2>
              <div className="case-artifact__route">
                <span>SUBMITTED</span>
                <i aria-hidden="true" />
                <span>IN REVIEW</span>
                <i aria-hidden="true" />
                <span>RESPONSE</span>
              </div>
              <p className="case-artifact__disclaimer">Illustrative process · no case data shown</p>
            </div>
            <figcaption>Private records stay within each authorized role.</figcaption>
          </motion.figure>
          <a className="public-hero__scroll" href="#how-it-works">
            <span>SCROLL TO FOLLOW THE RECORD</span>
            <i aria-hidden="true" />
          </a>
        </section>

        <motion.section
          className="campus-interlude"
          aria-labelledby="campus-interlude-title"
          initial={reduceMotion ? false : { opacity: 0.55, y: 72, scale: 0.965 }}
          {...(reduceMotion ? {} : { whileInView: { opacity: 1, y: 0, scale: 1 } })}
          viewport={{ once: true, amount: 0.28 }}
          transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="campus-interlude__copy">
            <p className="eyebrow">THE LNM INSTITUTE OF INFORMATION TECHNOLOGY · JAIPUR</p>
            <h2 id="campus-interlude-title">
              A campus community deserves a clear way to be heard.
            </h2>
          </div>
          <span className="campus-interlude__folio" aria-hidden="true">
            LNMIIT · CAMPUS VIEW
          </span>
        </motion.section>

        <LandingStorySequence />

        <section className="role-atlas" id="who-uses-sgrs" aria-labelledby="roles-heading">
          <motion.div
            className="role-atlas__heading"
            initial={reduceMotion ? false : { opacity: 0, y: 56 }}
            {...(reduceMotion ? {} : { whileInView: { opacity: 1, y: 0 } })}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <div>
              <p className="eyebrow">FIVE RESPONSIBILITIES · ONE SYSTEM</p>
              <h2 id="roles-heading">A different view for each role.</h2>
            </div>
            <p>
              Everyone signs in through the same secure entrance. The server identifies the account
              role and opens only its permitted workspace.
            </p>
          </motion.div>
          <ol className="role-atlas__list">
            {roles.map((role, index) => (
              <motion.li
                key={role.index}
                initial={reduceMotion ? false : { opacity: 0, y: 38, x: -14 }}
                {...(reduceMotion ? {} : { whileInView: { opacity: 1, y: 0, x: 0 } })}
                viewport={{ once: true, amount: 0.35 }}
                transition={{
                  duration: 0.75,
                  delay: index * 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <span className="role-atlas__index">{role.index}</span>
                <div>
                  <p className="eyebrow">{role.note}</p>
                  <h3>{role.title}</h3>
                  <p>{role.copy}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </section>

        <motion.section
          className="public-cta"
          aria-labelledby="cta-heading"
          initial={reduceMotion ? false : { opacity: 0, y: 72, scale: 0.97 }}
          {...(reduceMotion ? {} : { whileInView: { opacity: 1, y: 0, scale: 1 } })}
          viewport={{ once: true, amount: 0.28 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="eyebrow">PRIVATE ACCOUNT ACCESS</p>
          <h2 id="cta-heading">Continue with your SGRS account.</h2>
          <p>Use the email address and password attached to the account provisioned for you.</p>
          <Link className="button button--primary" to="/login">
            Go to sign in <span aria-hidden="true">↗</span>
          </Link>
        </motion.section>
      </main>

      <footer className="public-footer">
        <Link className="public-brand public-brand--footer" to="/">
          <img src="/lnmiit-logo.png" alt="The LNM Institute of Information Technology, Jaipur" />
          <span className="public-brand__rule" aria-hidden="true" />
          <span className="public-wordmark">
            SGRS<span> / STUDENT SERVICES</span>
          </span>
        </Link>
        <p>Student Grievance Redressal System · CS314 · T033</p>
        <a href="#main-content">Back to top ↑</a>
      </footer>
    </div>
  );
}
