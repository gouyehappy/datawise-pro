import {defineFeature} from '@/core/feature-contract'
import type {LazyViewLoader} from '@/core/registry/create-lazy-view'
import type {WorkspaceTabType} from '@/core/types'

const loadKafkaTopics: LazyViewLoader = () => import('./components/tabs/KafkaTopicsTab.vue')
const loadKafkaTopic: LazyViewLoader = () => import('./components/tabs/KafkaTopicTab.vue')
const loadKafkaConsumerGroups: LazyViewLoader = () =>
    import('./components/tabs/KafkaConsumerGroupsTab.vue')
const loadKafkaTablePublish: LazyViewLoader = () =>
    import('./components/tabs/KafkaTablePublishTab.vue')

const KAFKA_TABS = [
    {type: 'kafka-topics' as const satisfies WorkspaceTabType, loader: loadKafkaTopics},
    {type: 'kafka-topic' as const satisfies WorkspaceTabType, loader: loadKafkaTopic},
    {
        type: 'kafka-consumer-groups' as const satisfies WorkspaceTabType,
        loader: loadKafkaConsumerGroups,
    },
    {
        type: 'kafka-table-publish' as const satisfies WorkspaceTabType,
        loader: loadKafkaTablePublish,
    },
]

/**
 * Kafka workbench tabs — Feature Contract A-15 S3.
 * Open API for table-publish remains `openKafkaTablePublish` (A-06b); only component resolve moves here.
 */
export const kafkaFeature = defineFeature({
    id: 'workspace-kafka',
    contributes: {
        tabs: KAFKA_TABS.map(({type, loader}) => ({type, loader})),
    },
})
