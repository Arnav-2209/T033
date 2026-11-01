declare module '*.jsx' {
  import type { ComponentType, HTMLAttributes } from 'react';

  interface GrainientProps extends HTMLAttributes<HTMLDivElement> {
    colors?: string[];
    type?: 'linear' | 'radial';
    angle?: number;
    bands?: number;
    speed?: number;
    flow?: number;
    scale?: number;
    softness?: number;
    silk?: number;
    grainAmount?: number;
    grainSize?: number;
    grainAnimated?: boolean;
    contrast?: number;
    saturation?: number;
    variation?: number;
    interactive?: boolean;
    stir?: number;
    clickSwirl?: boolean;
    intro?: boolean;
    lightMode?: boolean;
    dpr?: number;
  }

  const Grainient: ComponentType<GrainientProps>;
  export default Grainient;
}
