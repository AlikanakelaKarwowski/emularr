import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

console.log('main.tsx: Starting React app');
console.log('main.tsx: Root element exists:', !!document.getElementById('root'));

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('main.tsx: Root element not found!');
  document.body.innerHTML = '<div style="padding: 20px; color: red;">Error: Root element not found</div>';
} else {
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
