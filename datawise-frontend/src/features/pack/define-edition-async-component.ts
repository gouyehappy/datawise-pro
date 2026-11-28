/**
 * Edition-gated `defineAsyncComponent` without `as any`.
 *
 * Stub vs full SFCs rarely share identical prop/emit types, so a ternary
 * `import()` union fails `AsyncComponentLoader`. Accept each branch as its
 * own loader, then pick at runtime.
 */
import {defineAsyncComponent, type AsyncComponentLoader} from 'vue'
import {isStandardEdition} from '@/features/pack/edition'

export function defineEditionAsyncComponent(
    full: AsyncComponentLoader,
    stub: AsyncComponentLoader,
) {
  return defineAsyncComponent((): ReturnType<AsyncComponentLoader> =>
      isStandardEdition() ? stub() : full(),
  )
}
