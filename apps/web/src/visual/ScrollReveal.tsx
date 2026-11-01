import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

type ScrollRevealProps = {
  as?: 'section' | 'article' | 'div' | 'li' | 'aside';
  children: ReactNode;
  className?: string;
  id?: string;
  delay?: number;
  distance?: number;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

export function ScrollReveal({
  as = 'section',
  children,
  className,
  id,
  delay = 0,
  distance = 34,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: ScrollRevealProps): ReactNode {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : { opacity: 0, y: distance, scale: 0.985 };
  const motionProps = {
    className,
    id,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    initial,
    ...(reduceMotion ? {} : { whileInView: { opacity: 1, y: 0, scale: 1 } }),
    viewport: { once: true, amount: 0.16 },
    transition: { duration: 0.78, delay, ease: [0.22, 1, 0.36, 1] as const },
  };

  if (as === 'article') return <motion.article {...motionProps}>{children}</motion.article>;
  if (as === 'li') return <motion.li {...motionProps}>{children}</motion.li>;
  if (as === 'aside') return <motion.aside {...motionProps}>{children}</motion.aside>;
  if (as === 'div') return <motion.div {...motionProps}>{children}</motion.div>;
  return <motion.section {...motionProps}>{children}</motion.section>;
}
