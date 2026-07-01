import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ShareView from './ShareView.jsx';
import './tailwind.css';
import './styles.css';

const pathMatch = window.location.pathname.match(/^\/run\/([^/]+)/);
const root = document.getElementById('root');

if (pathMatch) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ShareView planId={pathMatch[1]} />
    </React.StrictMode>
  );
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
