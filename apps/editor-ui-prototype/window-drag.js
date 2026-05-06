const windows = Array.from(document.querySelectorAll('[data-window]'));
let activeWindow = null;
let dragState = null;
let zIndex = 40;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function floatWindow(panel) {
    if (panel.classList.contains('floating')) {
        return;
    }

    const rect = panel.getBoundingClientRect();
    panel.dataset.dockedStyle = panel.getAttribute('style') || '';
    panel.classList.add('floating');
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.width = `${rect.width}px`;
    panel.style.height = `${rect.height}px`;
}

function dockWindow(panel) {
    panel.classList.remove('floating', 'dragging');
    panel.setAttribute('style', panel.dataset.dockedStyle || '');
    delete panel.dataset.dockedStyle;
}

function startDrag(event, panel) {
    if (event.button !== 0 || event.target.closest('button, input, textarea, select')) {
        return;
    }

    const rect = panel.getBoundingClientRect();
    floatWindow(panel);
    panel.classList.add('dragging');
    panel.style.zIndex = String(++zIndex);
    activeWindow = panel;
    dragState = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        width: rect.width,
        height: rect.height,
    };
    document.body.classList.add('draggingWindow');
    panel.setPointerCapture?.(event.pointerId);
}

function moveDrag(event) {
    if (!activeWindow || !dragState) {
        return;
    }

    const maxLeft = window.innerWidth - Math.min(160, dragState.width);
    const maxTop = window.innerHeight - 44;
    const left = clamp(event.clientX - dragState.offsetX, 0, maxLeft);
    const top = clamp(event.clientY - dragState.offsetY, 54, maxTop);

    activeWindow.style.left = `${left}px`;
    activeWindow.style.top = `${top}px`;
}

function stopDrag(event) {
    if (!activeWindow) {
        return;
    }

    activeWindow.classList.remove('dragging');
    activeWindow.releasePointerCapture?.(event.pointerId);
    activeWindow = null;
    dragState = null;
    document.body.classList.remove('draggingWindow');
}

for (const panel of windows) {
    const handle = panel.querySelector('[data-drag-handle]');
    if (!handle) {
        continue;
    }

    handle.addEventListener('pointerdown', (event) => startDrag(event, panel));
    handle.addEventListener('dblclick', () => dockWindow(panel));
}

window.addEventListener('pointermove', moveDrag);
window.addEventListener('pointerup', stopDrag);
window.addEventListener('pointercancel', stopDrag);
