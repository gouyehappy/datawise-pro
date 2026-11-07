import {onScopeDispose, ref, watch, type Ref} from 'vue'

/** 将源 ref 防抖后暴露，用于搜索等高频输入触发的重计算。 */
export function useDebouncedRef<T>(source: Ref<T>, delayMs: number): Ref<T> {
    const debounced = ref(source.value) as Ref<T>
    let timer: ReturnType<typeof setTimeout> | null = null

    watch(
        source,
        (value) => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
                debounced.value = value
                timer = null
            }, delayMs)
        },
        {immediate: true},
    )

    onScopeDispose(() => {
        if (timer) clearTimeout(timer)
    })

    return debounced
}
