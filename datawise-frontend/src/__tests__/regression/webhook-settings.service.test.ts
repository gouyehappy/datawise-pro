import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    isIssueWebhookChannel,
    shouldAutoConfirmWebhook,
} from '@/features/settings/services/webhook-settings.service'

describe('webhook-settings.service', () => {
    it('treats issue channels as manual-confirm only', () => {
        assert.equal(isIssueWebhookChannel('github_issue'), true)
        assert.equal(isIssueWebhookChannel('gitlab_issue'), true)
        assert.equal(isIssueWebhookChannel('jira_issue'), true)
        assert.equal(shouldAutoConfirmWebhook('github_issue'), false)
    })

    it('auto-confirms non-issue webhook channels', () => {
        assert.equal(shouldAutoConfirmWebhook('webhook'), true)
        assert.equal(shouldAutoConfirmWebhook('feishu'), true)
        assert.equal(shouldAutoConfirmWebhook('dingtalk'), true)
        assert.equal(shouldAutoConfirmWebhook('email'), true)
    })
})
