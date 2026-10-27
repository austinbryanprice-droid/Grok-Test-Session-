import { boot } from './rts/app';

boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  window.__error = message;
  const loading = document.querySelector<HTMLElement>('#loading p');
  if (loading) loading.textContent = message;
  throw error;
});
