type LogoProps = {
  className?: string;
  title?: string;
};

export function Logo({ className, title = 'OfferLens' }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="10" r="6.5" />
      <line x1="14.8" y1="14.8" x2="20.5" y2="20.5" />
      <line x1="7.5" y1="12" x2="7.5" y2="10.2" />
      <line x1="10" y1="12" x2="10" y2="8" />
      <line x1="12.5" y1="12" x2="12.5" y2="9" />
    </svg>
  );
}
