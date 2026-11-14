/**
 * Difficulty marks from https://icones.js.org (Iconify).
 * - streamline-ultimate:professions-man-astronaut-bold
 * - streamline-pixel:social-rewards-rating-star-2
 * - pixel:users-crown-solid
 */

type DiffIconProps = { label?: string }

export function DifficultyCadetIcon({ label }: DiffIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      className="diff-icon diff-icon--streamline"
    >
      <path
        fill="currentColor"
        d="M20.5 8.25v1a7.43 7.43 0 0 1-1.81 5a.51.51 0 0 0 .23.81A14.8 14.8 0 0 1 22 16.44a.5.5 0 0 0 .5 0a.52.52 0 0 0 .25-.44V7a3.74 3.74 0 0 0-2.66-3.57a.5.5 0 0 0-.59.71a8.8 8.8 0 0 1 1 4.11M5.08 15.08a.51.51 0 0 0 .23-.81a7.43 7.43 0 0 1-1.81-5v-1a8.9 8.9 0 0 1 1-4.08a.5.5 0 0 0-.6-.71A3.54 3.54 0 0 0 1.25 7v9a.52.52 0 0 0 .25.44a.5.5 0 0 0 .5 0a14.8 14.8 0 0 1 3.08-1.36M22.53 18a13.9 13.9 0 0 0-5.23-2.32a.52.52 0 0 0-.37.05A9.46 9.46 0 0 1 12 17a9.46 9.46 0 0 1-4.93-1.28a.52.52 0 0 0-.37-.05A13.9 13.9 0 0 0 1.47 18a2.45 2.45 0 0 0-1 2v3a.5.5 0 0 0 .5.5H23a.5.5 0 0 0 .5-.5v-3a2.45 2.45 0 0 0-.97-2m-2.28 2.09a.76.76 0 0 1-.75.75h-2a.75.75 0 0 1 0-1.5h2a.75.75 0 0 1 .75.74Zm-13 0a.76.76 0 0 1-.75.75h-2a.75.75 0 0 1 0-1.5h2a.75.75 0 0 1 .75.74ZM8.5 20a.51.51 0 0 1 .5-.5h6a.51.51 0 0 1 .5.52v2a.5.5 0 0 1-.5.5H9a.5.5 0 0 1-.5-.5Z"
      />
      <path
        fill="currentColor"
        d="M12 16c3.73 0 7.5-2.08 7.5-6.72v-1A7.64 7.64 0 0 0 12 .5a7.64 7.64 0 0 0-7.5 7.75v1C4.5 13.92 8.27 16 12 16m0-13.42a5.53 5.53 0 0 1 5.5 5.57c0 3.07-2.46 3.71-5.5 3.71s-5.5-.64-5.5-3.71A5.53 5.53 0 0 1 12 2.58"
      />
    </svg>
  )
}

export function DifficultySpecialistIcon({ label }: DiffIconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      className="diff-icon diff-icon--pixel"
    >
      <path
        fill="currentColor"
        d="M30.48 10.66h-9.15v1.53h-1.52v1.52h-1.52v1.52h-1.53V4.57h1.53V1.52h-1.53V0h-1.52v1.52h-1.53v3.05h-1.52v3.05h-1.52v3.04H1.52v1.53H0v1.52h1.52v1.52h1.53v1.53H6.1v1.52h1.52v3.05h1.52v-1.52h3.05v-1.53h3.05v1.53h-1.53v1.52h-1.52v1.52h-1.52v1.53H9.14v1.52H7.62v1.53H6.1v1.52H4.57v-1.52H3.05v3.04h1.52V32h3.05v-1.53h1.52v-1.52h3.05v-1.52h1.52V25.9h1.53v-1.52h1.52v-4.57h1.53v1.52h1.52v1.52h1.52v1.53h1.53v1.52h1.52v1.53h1.52v3.04h-1.52V32h3.05v-1.53h1.52v-3.04h-1.52v-3.05H25.9v-3.05h-1.52v-3.05h1.52v-1.52h-3.04v1.52h-6.1v-1.52h4.57v-1.53h1.53v-1.52h6.09v1.52h1.53v-1.52H32v-1.52h-1.52Zm-16.77 6.1h-3.04v-1.53H7.62v-1.52H4.57v-1.52h7.62v1.52h1.52Z"
      />
      <path
        fill="currentColor"
        d="M25.9 15.23h3.05v1.53H25.9Zm-3.04 13.72h1.52v1.52h-1.52Zm-3.05-1.52h3.05v1.52h-3.05Zm0-19.81h1.52v3.04h-1.52ZM18.29 25.9h1.52v1.53h-1.52Zm0-21.33h1.52v3.05h-1.52Zm-1.53 19.81h1.53v1.52h-1.53ZM6.1 21.33h1.52v3.05H6.1Zm-1.53 3.05H6.1v3.05H4.57Z"
      />
    </svg>
  )
}

export function DifficultyCommanderIcon({ label }: DiffIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      className="diff-icon diff-icon--pixel"
    >
      <path fill="currentColor" d="M16 20h-1v1H2v-1H1v-3h1v-1h1v-1h1v-1h9v1h1v1h1v1h1zm-3-8v-1h1V5h4v1h1v5h-1v1z" />
      <path
        fill="currentColor"
        d="M23 17v3h-1v1h-6v-1h1v-4h-1v-1h-1v-1h5v1h1v1h1v1zM12 3v1h-1v1h-1V4H9V3H8v1H7v1H6V4H5V3H4v7h1v1h1v1h5v-1h1v-1h1V3zm-1 6h-1v1H7V9H6V7h5z"
      />
    </svg>
  )
}