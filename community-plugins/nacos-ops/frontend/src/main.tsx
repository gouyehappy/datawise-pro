import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ConfirmProvider } from './lib/confirm'
import './styles.css'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <ConfirmProvider>
      <App />
    </ConfirmProvider>,
  )
}
