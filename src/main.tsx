import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

function initApp() {
  console.log('main.tsx: Starting React app');
  console.log('main.tsx: Document ready state:', document.readyState);
  console.log('main.tsx: Root element exists:', !!document.getElementById('root'));

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('main.tsx: Root element not found!');
    // Retry after a short delay
    setTimeout(() => {
      const retryElement = document.getElementById('root');
      if (!retryElement) {
        document.body.innerHTML = '<div style="padding: 20px; color: red;">Error: Root element not found</div>';
      } else {
        initApp();
      }
    }, 100);
    return;
  }

  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log('main.tsx: React app rendered');
  } catch (error) {
    console.error('main.tsx: Error rendering React app:', error);
    rootElement.innerHTML = `<div style="padding: 20px; color: red;">Error: ${error}</div>`;
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  // DOM is already ready
  initApp();
}
