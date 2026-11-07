import {createApp} from 'vue'
import App from './App.vue'
import {
  applyTheme,
  createToastController,
  DW_TOAST,
} from '@datawise/framework'
import '@datawise/framework/style.css'
import './playground.css'

const app = createApp(App)
const toast = createToastController()
app.provide(DW_TOAST, toast)

app.mount('#app')
