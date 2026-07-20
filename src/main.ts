import { EditorApp } from './ui/EditorApp';
import { t } from './core/i18n/zh-Hant';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app');
}

document.title = t('appTitle');

const app = new EditorApp(root);
app.start();
