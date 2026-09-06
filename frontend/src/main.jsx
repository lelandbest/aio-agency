import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker } from './services/pwaRegister'

// Register or unregister Service Worker based on deployment profile
registerServiceWorker();

const root = document.getElementById('root')
if (!root) {
  console.error('Root element not found!')
  document.body.innerHTML = '<div style="color: red; padding: 20px; font-size: 20px;">ERROR: Root element not found</div>'
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
