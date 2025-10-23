import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './components/App.jsx'
import 'bootstrap/dist/css/bootstrap.min.css'
import { initTheme } from "./utils/theme"; 
initTheme()
  
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
