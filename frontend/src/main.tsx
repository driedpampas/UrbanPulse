import { render } from 'preact';
import './index.css';
import { App } from './app.tsx';

const app = document.getElementById('app');
if (!app) {
    throw new Error('Failed to find root element');
}
render(<App />, app);
