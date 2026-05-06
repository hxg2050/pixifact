import React from 'react';
import { createRoot } from 'react-dom/client';
import { EditorApp } from './EditorApp';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('缺少根节点。');
}

createRoot(rootElement).render(
    <React.StrictMode>
        <EditorApp />
    </React.StrictMode>,
);
