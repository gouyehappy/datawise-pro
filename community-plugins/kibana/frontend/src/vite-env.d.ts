/// <reference types="vite/client" />

declare module '*.css?raw' {
  const css: string
  export default css
}

declare module '@elastic/datemath' {
  import type { Moment } from 'moment'
  interface DateMathOptions {
    forceNow?: Date
    moment?: typeof import('moment')
    roundUp?: boolean
  }
  function parse(input?: string, options?: DateMathOptions): Moment | undefined
  function parseDate(datestring: string, roundUp?: boolean, moment?: typeof import('moment')): Moment | undefined
  export default { parse, parseDate }
}
