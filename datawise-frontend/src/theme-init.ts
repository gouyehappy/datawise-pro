/**
 * 必须在 global.css 之前执行，避免深色模式下 :root 浅色变量与 [data-theme=dark] 混搭。
 */
import {bootstrapTheme} from '@/features/settings/services/theme.service'

bootstrapTheme()
