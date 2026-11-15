/**
 * Difficulty & UI marks from https://icones.js.org (Iconify).
 * - streamline-ultimate:professions-man-astronaut-bold
 * - streamline-pixel:social-rewards-rating-star-2
 * - pixel:users-crown-solid
 * - pixelarticons:alert
 * - pixelarticons:rocket
 * - pixelarticons:check
 * - pixelarticons:radio-tower
 * - pixelarticons:radio
 * - pixelarticons:building
 * - pixelarticons:trophy
 * - pixelarticons:arrow-right
 * - pixelarticons:flag
 */

export type PixelIconProps = {
  label?: string
  className?: string
  size?: number
}

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

/** pixelarticons:alert — https://icones.js.org */
export function HoldAlertPixelIcon({ label }: DiffIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      className="hold-pixel-icon"
    >
      <path
        fill="currentColor"
        d="M12 1.67L2 20.33h20L12 1.67zm1 14.33h-2v-2h2v2zm0-4h-2V8h2v4z"
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

/** pixelarticons:rocket — https://icones.js.org */
export function PixelRocketIcon({ label, className, size = 16 }: PixelIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={`pixel-icon ${className ?? ''}`.trim()}
    >
      <path
        fill="currentColor"
        d="M10 2h4v2h-4V2zm-2 2h2v2H8V4zm8 0h-2v2h2V4zm-6 2h4v2h-4V6zm-2 2h2v2H8V8zm8 0h-2v2h2V8zm-8 2h2v2H8v-2zm8 0h-2v2h2v-2zM6 12h2v2H6v-2zm10 0h2v2h-2v-2zM4 14h2v2H4v-2zm14 0h2v2h-2v-2zM2 16h2v2H2v-2zm16 0h2v2h-2v-2zM2 18h2v2H2v-2zm16 0h2v2h-2v-2zM6 20h2v2H6v-2zm8 0h2v2h-2v-2zM8 22h8v2H8v-2z"
      />
    </svg>
  )
}

/** pixelarticons:check — https://icones.js.org */
export function PixelCheckIcon({ label, className, size = 14 }: PixelIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={`pixel-icon ${className ?? ''}`.trim()}
    >
      <path
        fill="currentColor"
        d="M20 6h-2v2h-2v2h-2v2h-2v2H12v2H10v-2H8v-2H6v-2H4V8H2v8h2v2h2v2h2v2h2v-2h2v-2h2v-2h2v-2h2V6z"
      />
    </svg>
  )
}

/** pixelarticons:radio-tower — https://icones.js.org */
export function PixelRadioTowerIcon({ label, className, size = 15 }: PixelIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={`pixel-icon ${className ?? ''}`.trim()}
    >
      <path
        fill="currentColor"
        d="M22 2h-2v2h2v12h-2v2h2v-2h2V4h-2zM2 4H0v12h2v2h2v-2H2zm0 0V2h2v2zm4 2H4v8h2zm0 0V4h2v2zm4 0h4v2h-4zm0 6H8V8h2zm4 0h-4v2H8v4H6v4h2v-4h2v-4h4v4h2v4h2v-4h-2v-4h-2zm0 0h2V8h-2zm6-6h-2V4h-2v2h2v8h2z"
      />
    </svg>
  )
}

/** pixelarticons:radio — https://icones.js.org */
export function PixelRadioIcon({ label, className, size = 15 }: PixelIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={`pixel-icon ${className ?? ''}`.trim()}
    >
      <path
        fill="currentColor"
        d="M17 3H7v2H5v2H3v10h2v2h2v2h10v-2h2v-2h2V7h-2V5h-2V3zm0 2v2h2v10h-2v2H7v-2H5V7h2V5h10zm-9 4h2v2H8V9zm4 0h4v2h-4V9zM8 13h8v2H8v-2z"
      />
    </svg>
  )
}

/** pixelarticons:building — https://icones.js.org */
export function PixelBuildingIcon({ label, className, size = 16 }: PixelIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={`pixel-icon ${className ?? ''}`.trim()}
    >
      <path
        fill="currentColor"
        d="M4 20h16v2H4zm16-10h2v10h-2zM2 10h2v10H2zm2-2h2v2H4zm2-2h2v2H6zm2-2h2v2H8zm2-2h4v2h-4zm4 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zM8 14h2v6H8zm2-2h4v2h-4zm4 2h2v6h-2z"
      />
    </svg>
  )
}

/** pixelarticons:trophy — https://icones.js.org */
export function PixelTrophyIcon({ label, className, size = 16 }: PixelIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={`pixel-icon ${className ?? ''}`.trim()}
    >
      <path
        fill="currentColor"
        d="M5 3h14v2H5V3zm2 4h10v2H7V7zm2 4h6v2H9v-2zm2 4h2v2h-2v-2zm-4 4h10v2H7v-2z"
      />
    </svg>
  )
}

/** pixelarticons:arrow-right — https://icones.js.org */
export function PixelArrowRightIcon({ label, className, size = 14 }: PixelIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={`pixel-icon ${className ?? ''}`.trim()}
    >
      <g fill="currentColor">
        <path d="M4 11v2h16v-2zm12 2v2h2v-2zm-2 2v2h2v-2zm-2 2v2h2v-2zm4-6V9h2v2z" />
        <path d="M14 15V7h2v8zm-2 2V5h2v12z" />
      </g>
    </svg>
  )
}

/** pixelarticons:flag — https://icones.js.org */
export function PixelFlagIcon({ label, className, size = 16 }: PixelIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={`pixel-icon ${className ?? ''}`.trim()}
    >
      <path
        fill="currentColor"
        d="M6 2h2v2h3v2h2V4h8v11h-2v2h-3v2h-2v-2H8v5H6V2zm2 2v11h3v2h2v-2h3V6H11V4H8z"
      />
    </svg>
  )
}

/** streamline-ultimate:astronomy-planet-saturn-1-bold — https://icones.js.org */
export function PlanetSaturnIcon({ label, className, size = 14 }: PixelIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={!label}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={`streamline-icon ${className ?? ''}`.trim()}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <path
        fill="currentColor"
        d="M23.457.551a1.07 1.07 0 0 0-1.508 0L.56 21.941a1.07 1.07 0 0 0 0 1.509a1.07 1.07 0 0 0 1.507 0l3.712-3.744q.917.54 1.925.877l8.45-8.449a.802.802 0 0 1 1.133 1.134l-7.69 7.765q.666.09 1.337.085c7.822-.01 12.7-8.483 8.78-15.252l-.031-.053l3.743-3.754a1.07 1.07 0 0 0 .032-1.508M4.184 8.038a.802.802 0 1 1 1.134 1.134L1.04 13.45c.33 1.232.893 2.39 1.657 3.412L16.87 2.69C10.507-1.846 1.62 2.205.872 9.982q-.045.471-.046.944v.502Z"
      />
    </svg>
  )
}