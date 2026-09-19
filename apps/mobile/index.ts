import { registerRootComponent } from 'expo';
import { patchXhrStatusZero } from './src/api/patch-xhr-status0';
import App from './App';

patchXhrStatusZero();
registerRootComponent(App);
