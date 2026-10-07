import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializePwa } from './services/pwa';

void initializePwa().catch((error) => console.warn('PWA initialization failed:', error));

createRoot(document.getElementById('root')!).render(<App />);
