import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'dither-art': React.HTMLAttributes<HTMLElement> & { mode?: 'signal' | 'flow' | 'stream' | 'noise'; dir?: string; cell?: string; class?: string };
    }
  }
}
