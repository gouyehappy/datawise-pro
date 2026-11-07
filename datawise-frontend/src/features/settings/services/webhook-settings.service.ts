const ISSUE_WEBHOOK_CHANNELS = new Set(['github_issue', 'gitlab_issue', 'jira_issue'])

export function isIssueWebhookChannel(channel: string | undefined): boolean {
    return ISSUE_WEBHOOK_CHANNELS.has((channel ?? '').trim().toLowerCase())
}

export function shouldAutoConfirmWebhook(channel: string | undefined): boolean {
    return !isIssueWebhookChannel(channel)
}
