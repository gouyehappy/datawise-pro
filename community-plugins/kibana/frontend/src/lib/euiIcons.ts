/**
 * EUI icons are loaded asynchronously by name. Vite production builds do not
 * keep those dynamic imports, and opaque-origin blob modules cannot resolve
 * `new URL(..., import.meta.url)` — register every icon we (and EUI chrome
 * such as SuperDatePicker) need eagerly.
 */
import { appendIconComponentCache } from '@elastic/eui/es/components/icon/icon'

import { icon as arrowDown } from '@elastic/eui/es/components/icon/assets/arrow_down'
import { icon as arrowLeft } from '@elastic/eui/es/components/icon/assets/arrow_left'
import { icon as arrowRight } from '@elastic/eui/es/components/icon/assets/arrow_right'
import { icon as calendar } from '@elastic/eui/es/components/icon/assets/calendar'
import { icon as check } from '@elastic/eui/es/components/icon/assets/check'
import { icon as clock } from '@elastic/eui/es/components/icon/assets/clock'
import { icon as cross } from '@elastic/eui/es/components/icon/assets/cross'
import { icon as crossInCircle } from '@elastic/eui/es/components/icon/assets/crossInCircle'
import { icon as empty } from '@elastic/eui/es/components/icon/assets/empty'
import { icon as filter } from '@elastic/eui/es/components/icon/assets/filter'
import { icon as gear } from '@elastic/eui/es/components/icon/assets/gear'
import { icon as iInCircle } from '@elastic/eui/es/components/icon/assets/iInCircle'
import { icon as list } from '@elastic/eui/es/components/icon/assets/list'
import { icon as magnifyWithMinus } from '@elastic/eui/es/components/icon/assets/magnifyWithMinus'
import { icon as magnifyWithPlus } from '@elastic/eui/es/components/icon/assets/magnifyWithPlus'
import { icon as minusInCircle } from '@elastic/eui/es/components/icon/assets/minus_in_circle'
import { icon as plus } from '@elastic/eui/es/components/icon/assets/plus'
import { icon as plusInCircle } from '@elastic/eui/es/components/icon/assets/plus_in_circle'
import { icon as plusInCircleFilled } from '@elastic/eui/es/components/icon/assets/plus_in_circle_filled'
import { icon as refresh } from '@elastic/eui/es/components/icon/assets/refresh'
import { icon as search } from '@elastic/eui/es/components/icon/assets/search'
import { icon as sortDown } from '@elastic/eui/es/components/icon/assets/sort_down'
import { icon as sortLeft } from '@elastic/eui/es/components/icon/assets/sortLeft'
import { icon as sortRight } from '@elastic/eui/es/components/icon/assets/sortRight'
import { icon as sortUp } from '@elastic/eui/es/components/icon/assets/sort_up'
import { icon as timeRefresh } from '@elastic/eui/es/components/icon/assets/timeRefresh'

appendIconComponentCache({
  arrowDown,
  arrowLeft,
  arrowRight,
  calendar,
  check,
  clock,
  cross,
  crossInCircle,
  empty,
  filter,
  gear,
  iInCircle,
  list,
  magnifyWithMinus,
  magnifyWithPlus,
  minusInCircle,
  plus,
  plusInCircle,
  plusInCircleFilled,
  refresh,
  search,
  sortDown,
  sortLeft,
  sortRight,
  sortUp,
  timeRefresh,
})
