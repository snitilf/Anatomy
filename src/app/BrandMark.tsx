/**
 * The mark of Anatomy: a part, a connection, and the part it leads to. It is the same drawing as `public/favicon.svg`, in the tokens
 * of the page: the text color for the first part and its line, and the accent for the part it leads to (the one place the mark uses color).
 * It is a picture beside the word, so it has no name of its own.
 */
export function BrandMark({ size = 18, className }: { size?: number; className?: string | undefined }) {
  return (
    <svg className={className} data-testid="brand-mark" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <g data-part="ink" stroke="var(--fg)" strokeWidth="2.2" strokeLinejoin="round">
        <rect x="2.1" y="2.1" width="8.8" height="8.8" rx="2.4" />
        <path d="M10.9 6.5H17.5V12.8" />
      </g>
      <rect data-part="accent" x="12.5" y="12.5" width="9.5" height="9.5" rx="2.6" fill="var(--accent)" />
    </svg>
  )
}
