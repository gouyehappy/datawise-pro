/** Map raw Docker / OS errors into actionable recovery tips for the workbench banner. */

export interface FriendlyError {
  message: string
  tip?: string
}

type Translate = (key: string) => string

export function friendlyDockerError(raw: unknown, t: Translate): FriendlyError {
  const message = raw instanceof Error ? raw.message : String(raw ?? '')
  if (!message.trim()) {
    return { message: t('errorUnknown'), tip: t('errorTipRetry') }
  }

  const lower = message.toLowerCase()

  if (
    lower.includes('npipe') ||
    lower.includes('named pipe') ||
    lower.includes('docker_engine') ||
    lower.includes('dockerdesktoplinuxengine') ||
    lower.includes('the system cannot find the file') ||
    lower.includes('cannot find the file specified') ||
    lower.includes('pipe') && lower.includes('connect')
  ) {
    return { message, tip: t('errorTipLocalDesktop') }
  }

  if (
    (lower.includes('permission denied') || lower.includes('access is denied')) &&
    (lower.includes('docker.sock') || lower.includes('/var/run/docker') || lower.includes('unix'))
  ) {
    return { message, tip: t('errorTipUnixPerm') }
  }

  if (
    lower.includes('connection refused') ||
    lower.includes('actively refused') ||
    lower.includes('no connection could be made') ||
    lower.includes('econnrefused')
  ) {
    return { message, tip: t('errorTipRefused') }
  }

  if (
    lower.includes('knownhosts') ||
    lower.includes('host key') ||
    lower.includes('unable to authenticate') ||
    lower.includes('ssh:') ||
    (lower.includes('ssh') && (lower.includes('handshake') || lower.includes('auth')))
  ) {
    return { message, tip: t('errorTipSsh') }
  }

  if (lower.includes('tls') || lower.includes('x509') || lower.includes('certificate')) {
    return { message, tip: t('errorTipTls') }
  }

  if (lower.includes('missing connection') || lower.includes('connection context')) {
    return { message, tip: t('errorTipMissingConnection') }
  }

  return { message, tip: t('errorTipRetry') }
}
