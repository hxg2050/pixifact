import { createPinia } from 'pinia';
import { createApp } from 'vue';
import EditorApp from './EditorApp.vue';
import './styles.css';

createApp(EditorApp)
    .use(createPinia())
    .mount('#app');
