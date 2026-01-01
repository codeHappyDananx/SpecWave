import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('specwave', {
  ping: () => 'pong'
});

declare global {
  interface Window {
    specwave: {
      ping: () => string;
    };
  }
}
