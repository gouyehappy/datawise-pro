type Props = {
  active: boolean
  enterLabel: string
  exitLabel: string
  onToggle: () => void
}

export function FullscreenToggle({ active, enterLabel, exitLabel, onToggle }: Props) {
  const label = active ? exitLabel : enterLabel
  return (
    <button
      type="button"
      className={`ed-bar__btn ed-bar__btn--icon ${active ? 'is-active' : ''}`}
      title={label}
      aria-label={label}
      onClick={onToggle}
    >
      {active ? (
        <svg width="12" height="12" viewBox="0 0 13 13" aria-hidden>
          <path
            d="M4.5 1.5H1.5V4.5M8.5 1.5H11.5V4.5M4.5 11.5H1.5V8.5M8.5 11.5H11.5V8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 13 13" aria-hidden>
          <path
            d="M1.5 4.5V1.5H4.5M8.5 1.5H11.5V4.5M1.5 8.5V11.5H4.5M8.5 11.5H11.5V8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}
