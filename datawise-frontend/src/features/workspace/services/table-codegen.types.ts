import type {TablePropertiesResult} from '@/shared/api/types'

export type TableCodeTemplate = 'jpa' | 'mybatis' | 'typescript'

export interface TableCodegenInput {
    properties: TablePropertiesResult
    packageName?: string
}
