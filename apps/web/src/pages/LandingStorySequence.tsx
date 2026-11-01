import { useEffect, useState, type ReactNode } from 'react';

const chapters = [
  {
    id: 'record',
    number: '01',
    title: 'One clear record.',
    copy: 'Describe the concern once. Keep its category, supporting evidence and reference together.',
    marker: 'A student submits a case',
  },
  {
    id: 'route',
    number: '02',
    title: 'A considered route.',
    copy: 'The case follows its active category assignment. If no handler is mapped, it waits for an administrator.',
    marker: 'The case reaches its assigned handler',
  },
  {
    id: 'review',
    number: '03',
    title: 'A careful review.',
    copy: 'Handlers record investigation steps. Escalated cases reach the reviewer assigned to that level.',
    marker: 'The right people review the record',
  },
  {
    id: 'outcome',
    number: '04',
    title: 'A visible outcome.',
    copy: 'Students follow case history, read the resolution and share feedback within the three-day window.',
    marker: 'The student receives an outcome',
  },
];

export function LandingStorySequence(): ReactNode {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const chaptersInView = document.querySelectorAll<HTMLElement>('[data-story-chapter]');
    if (reduceMotion && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          const current = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (current) setActiveIndex(Number((current.target as HTMLElement).dataset.storyChapter));
        },
        { rootMargin: '-32% 0px -38% 0px', threshold: [0.15, 0.35, 0.6] },
      );
      chaptersInView.forEach((chapter) => observer.observe(chapter));
      return () => observer.disconnect();
    }
    let cancelled = false;
    let revert: (() => void) | undefined;
    async function attachScrollStory(): Promise<void> {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      const context = gsap.context(() => {
        const nodes = gsap.utils.toArray<HTMLElement>('[data-story-chapter]');
        nodes.forEach((node) => {
          const activate = (): void => setActiveIndex(Number(node.dataset.storyChapter));
          ScrollTrigger.create({
            trigger: node,
            start: 'top 64%',
            end: 'bottom 38%',
            onEnter: activate,
            onEnterBack: activate,
          });

          gsap.fromTo(
            node.querySelector('div'),
            { y: 42, autoAlpha: 0.34 },
            {
              y: 0,
              autoAlpha: 1,
              ease: 'none',
              scrollTrigger: {
                trigger: node,
                start: 'top 78%',
                end: 'top 43%',
                scrub: 0.65,
              },
            },
          );
        });
        gsap.fromTo(
          '.landing-story__intro > *',
          { y: 42, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            stagger: 0.14,
            duration: 0.9,
            ease: 'power3.out',
            scrollTrigger: { trigger: '.landing-story__intro', start: 'top 82%', once: true },
          },
        );

        const progress = gsap.timeline({
          scrollTrigger: {
            trigger: '.landing-story__sequence',
            start: 'top 76%',
            end: 'bottom 70%',
            scrub: 0.8,
          },
        });
        progress
          .fromTo(
            '.story-visual__diagram',
            { y: 58, scale: 0.88, rotation: -3, autoAlpha: 0.58 },
            { y: 0, scale: 1, rotation: 0, autoAlpha: 1, duration: 0.4, ease: 'none' },
            0,
          )
          .to('.story-route--progress', { strokeDashoffset: 0, duration: 1, ease: 'none' }, 0)
          .fromTo(
            '.story-file',
            { y: 26, scale: 0.76, autoAlpha: 0.42, transformOrigin: '50% 50%' },
            { y: 0, scale: 1, autoAlpha: 1, duration: 0.72, ease: 'none' },
            0.16,
          );
        ScrollTrigger.refresh();
      });
      revert = () => context.revert();
    }
    void attachScrollStory();
    return () => {
      cancelled = true;
      revert?.();
    };
  }, []);

  const activeChapter = chapters[activeIndex] ?? {
    number: '01',
    marker: 'A student submits a case',
  };
  return (
    <section className="landing-story" id="how-it-works" aria-labelledby="story-heading">
      <div className="landing-story__intro">
        <p className="eyebrow">A PROCESS WITH A RECORD</p>
        <h2 id="story-heading">From first report to considered response.</h2>
        <p>
          Each step stays connected to the same case file, so students and authorized staff can
          follow what happened and what comes next.
        </p>
      </div>

      <div className="landing-story__sequence">
        <div className="story-visual" data-active-step={activeIndex}>
          <div className="story-visual__topline">
            <span>CASE JOURNEY</span>
            <span>{activeChapter.number} / 04</span>
          </div>
          <div className="story-visual__diagram" aria-hidden="true">
            <svg viewBox="0 0 480 360" preserveAspectRatio="xMidYMid meet">
              <path className="story-route story-route--base" d="M80 54 V306" />
              <path
                className="story-route story-route--progress"
                d="M80 54 V306 M150 306 C186 306 197 254 232 254"
                pathLength="1"
              />
              {chapters.map((chapter, index) => (
                <g
                  className={
                    'story-node' +
                    (activeIndex >= index ? ' is-reached' : '') +
                    (activeIndex === index ? ' is-current' : '')
                  }
                  key={chapter.id}
                  transform={`translate(80 ${54 + index * 84})`}
                >
                  <circle r="16" />
                  <text x="44" y="6">
                    {chapter.number}
                  </text>
                </g>
              ))}
              <g className="story-file" transform="translate(246 196)">
                <path d="M0 0h112l22 22v96H0z" />
                <path d="M112 0v22h22" />
                <path d="M18 45h78M18 62h64M18 79h53" />
              </g>
            </svg>
          </div>
          <p className="story-visual__caption">{activeChapter.marker}</p>
          <span className="story-visual__folio">SGRS · PROCESS NOTE</span>
        </div>

        <ol className="landing-story__chapters">
          {chapters.map((chapter, index) => (
            <li
              aria-current={activeIndex === index ? 'step' : undefined}
              data-story-chapter={index}
              id={`story-${chapter.id}`}
              key={chapter.id}
            >
              <span className="landing-story__number">{chapter.number}</span>
              <div>
                <h3>{chapter.title}</h3>
                <p>{chapter.copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
