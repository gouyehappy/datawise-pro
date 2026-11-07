import {registerFeatures} from '@/core/feature-contract'
import {aiFeature} from '@/features/ai/ai.feature'
import {communityPluginFeature} from '@/features/community-plugin/community-plugin.feature'
import {shellSlotsFeature} from '@/features/layout/shell-slots.feature'
import {workbenchNavFeature} from '@/features/layout/workbench-nav.feature'
import {settingsFeature} from '@/features/settings/settings.feature'
import {catalogFeature} from '@/features/workspace/catalog.feature'
import {configCenterFeature} from '@/features/workspace/config-center.feature'
import {elasticsearchFeature} from '@/features/workspace/elasticsearch.feature'
import {governanceFeature} from '@/features/workspace/governance.feature'
import {jenkinsFeature} from '@/features/workspace/jenkins.feature'
import {kafkaFeature} from '@/features/workspace/kafka.feature'
import {kubernetesFeature} from '@/features/workspace/kubernetes.feature'
import {mongoFeature} from '@/features/workspace/mongo.feature'
import {redisFeature} from '@/features/workspace/redis.feature'
import {sshFeature} from '@/features/workspace/ssh.feature'
import {workspaceShellFeature} from '@/features/workspace/workspace-shell.feature'
import {yarnFeature} from '@/features/workspace/yarn.feature'
import {assertWorkspaceTabContributionsValid} from '@/features/workspace/tab-registry'
import {assertWorkbenchModuleContributionsValid} from '@/features/layout/module-registry'

/** Boot-time Feature Contract registration (A-09 / A-10 / A-15 / A-16). Add new defineFeature exports here. */
export function registerBuiltinFeatures(): void {
    registerFeatures([
        shellSlotsFeature,
        workbenchNavFeature,
        communityPluginFeature,
        aiFeature,
        settingsFeature,
        workspaceShellFeature,
        governanceFeature,
        catalogFeature,
        configCenterFeature,
        yarnFeature,
        jenkinsFeature,
        redisFeature,
        elasticsearchFeature,
        mongoFeature,
        kafkaFeature,
        kubernetesFeature,
        sshFeature,
    ])
    assertWorkspaceTabContributionsValid()
    assertWorkbenchModuleContributionsValid()
}
