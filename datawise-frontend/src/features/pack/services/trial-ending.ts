/** Trial packs nearing expiry — soft upsell threshold (days inclusive). */
export const TRIAL_ENDING_DAYS_THRESHOLD = 3

export type TrialEndingPack = {
    packId: string
    trialDaysLeft: number
}

export function listEndingTrials(
    packs: ReadonlyArray<{id: string; state: string; trialDaysLeft?: number | null}>,
    threshold = TRIAL_ENDING_DAYS_THRESHOLD,
): TrialEndingPack[] {
    return packs
        .filter(
            (pack) =>
                pack.state === 'trial' &&
                pack.trialDaysLeft != null &&
                pack.trialDaysLeft >= 0 &&
                pack.trialDaysLeft <= threshold,
        )
        .map((pack) => ({
            packId: pack.id,
            trialDaysLeft: pack.trialDaysLeft as number,
        }))
        .sort((a, b) => a.trialDaysLeft - b.trialDaysLeft)
}
