import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);

// keep the view in sync with browser back/forward between "/" and "/admin"
import { useStore } from './store';
window.addEventListener('popstate', () => {
  const v = useStore.getState().view;
  if (location.pathname.startsWith('/admin')) useStore.setState({ view: 'admin' });
  else if (v === 'admin') useStore.setState({ view: 'home' });
});
