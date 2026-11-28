/**
 * The mark of Anatomy, Blade: an A cut from one solid form, a light leg and a heavy stem under a flat top, open below the middle.
 * It is one path in the text color, so it follows the theme with the word beside it, and it is the same drawing as
 * `public/favicon.svg`. The drawing is fitted to 16 px: keep the 24 grid, keep the margins of the view box, and use it at 16, 32, 48,
 * 64 px or larger, never at 18, 20, or 24 px, where its flat edges fall between pixels.
 * It is a picture beside the word, so it has no name of its own.
 */
export function BrandMark({ size = 16, className }: { size?: number; className?: string | undefined }) {
  return (
    <svg className={className} data-testid="brand-mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="var(--fg)"
        d="M10.26 2.16A1 1 0 0 1 11.21 1.5L12.8 1.5A1 1 0 0 1 13.74 2.16L20.64 21.5A0.75 0.75 0 0 1 19.94 22.5L14.03 22.5A0.75 0.75 0 0 1 13.32 22L9.75 12L6.18 22A0.75 0.75 0 0 1 5.47 22.5L4.06 22.5A0.75 0.75 0 0 1 3.36 21.5Z"
      />
    </svg>
  )
}
