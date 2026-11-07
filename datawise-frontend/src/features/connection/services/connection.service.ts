import {createId} from '@/core/utils/id'

/** 新建连接节点 ID */
export function buildConnectionNodeId(): string {
    return createId('conn')
}
