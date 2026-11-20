interface MideoLogoProps {
  variant?: 'full' | 'mark';
  className?: string;
  heightClass?: string;
}

/**
 * Official MideoCode Brand Assets
 * - `full`: Full wordmark + M symbol + tagline (dark & light transparent PNG variants)
 * - `mark`: Standalone M symbol + swoosh + </> (transparent PNG for both dark & light themes)
 * Strictly preserves original proportions (object-contain, w-auto) without distortion or borders.
 */
export function MideoLogo({
  variant = 'full',
  className = '',
  heightClass = variant === 'mark' ? 'h-8' : 'h-10',
}: MideoLogoProps) {
  if (variant === 'mark') {
    return (
      <img
        src="/assets/brand/mideocode-mark.png"
        alt="MideoCode symbol"
        draggable={false}
        className={`${heightClass} w-auto object-contain select-none shrink-0 ${className}`}
      />
    );
  }

  return (
    <span className={`inline-flex items-center shrink-0 select-none ${className}`}>
      <img
        src="/assets/brand/mideocode-logo-light.png"
        alt="MideoCode — Learn. Code. Build. Become."
        draggable={false}
        className={`${heightClass} w-auto object-contain dark:hidden`}
      />
      <img
        src="/assets/brand/mideocode-logo-dark.png"
        alt="MideoCode — Learn. Code. Build. Become."
        draggable={false}
        className={`${heightClass} w-auto object-contain hidden dark:block`}
      />
    </span>
  );
}
