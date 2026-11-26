/*
 * полный сброс локального состояния сайта
 *
 * Назначение: привести браузер к состоянию «чистого запуска» — без учёта
 * серверной БД. Удаляет всё, что фронтенд мог сохранить локально:
 *   - localStorage (токен сессии, роль, кэш каталога, черновики форм);
 *   - sessionStorage;
 *   - все базы IndexedDB текущего origin;
 *   - все кэши Cache Storage (Cache API);
 *   - все зарегистрированные Service Worker'ы;
 *   - все НЕ-httpOnly куки текущего домена.
 *
 * ВАЖНО: httpOnly-куки и серверная сессия в PostgreSQL этот скрипт НЕ трогает.
 * Если нужно обнулить и сервер — выполните отдельно TRUNCATE или pg_restore
 * из schema.sql / full_backup.sql.
 *
 * Использование: открыть сайт → F12 → вкладка Console → вставить весь файл
 * целиком → Enter. Страница перезагрузится автоматически.
 */

(async function resetLocalState() {
  const log = (msg) => console.log('%c[Lingradable reset]', 'color:#0a7;font-weight:bold', msg);
  const warn = (msg) => console.warn('[Lingradable reset]', msg);

  // 1. Web Storage -----------------------------------------------------------
  try {
    const lsKeys = Object.keys(localStorage).length;
    const ssKeys = Object.keys(sessionStorage).length;
    localStorage.clear();
    sessionStorage.clear();
    log(`localStorage: удалено ${lsKeys} записей, sessionStorage: удалено ${ssKeys} записей.`);
  } catch (e) {
    warn('Web Storage недоступен: ' + e.message);
  }

  // 2. Cookies (не-httpOnly) -------------------------------------------------
  try {
    const cookies = document.cookie ? document.cookie.split(';').map(c => c.split('=')[0].trim()) : [];
    const host = location.hostname;
    const domains = ['', `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
    const paths = ['/', ''];
    let cleared = 0;
    for (const name of cookies) {
      for (const domain of domains) {
        for (const path of paths) {
          document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=${domain}; Path=${path};`;
          document.cookie = `${name}=; Max-Age=0; Path=${path};`; // fallback без Domain
          cleared++;
        }
      }
    }
    log(`Cookies: отправлено ${cleared} директив на удаление (осталось: ${document.cookie ? document.cookie.split(';').length : 0}).`);
    if (document.cookie) warn('Часть кук может быть httpOnly — их из JS удалить нельзя, чисти через DevTools → Application → Cookies.');
  } catch (e) {
    warn('Cookies: ' + e.message);
  }

  // 3. IndexedDB -------------------------------------------------------------
  try {
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        await new Promise((res, rej) => {
          const req = indexedDB.deleteDatabase(db.name);
          req.onsuccess = res;
          req.onerror = () => rej(req.error);
          req.onblocked = () => { warn(`IndexedDB «${db.name}» заблокирована открытой вкладкой — закрой её и повтори.`); res(); };
        });
      }
      log(`IndexedDB: удалено баз: ${dbs.length}${dbs.length ? ' (' + dbs.map(d => d.name).join(', ') + ')' : ''}.`);
    } else {
      warn('IndexedDB.databases() не поддерживается этим браузером — чисти вручную через DevTools → Application → IndexedDB.');
    }
  } catch (e) {
    warn('IndexedDB: ' + e.message);
  }

  // 4. Cache Storage ---------------------------------------------------------
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      log(`Cache Storage: удалено кэшей: ${keys.length}${keys.length ? ' (' + keys.join(', ') + ')' : ''}.`);
    } else {
      log('Cache Storage недоступен в этом контексте (нужен HTTPS или localhost).');
    }
  } catch (e) {
    warn('Cache Storage: ' + e.message);
  }

  // 5. Service Workers -------------------------------------------------------
  try {
    if ('serviceWorkers' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
      log(`Service Workers: отписано: ${regs.length}.`);
    }
  } catch (e) {
    warn('Service Workers: ' + e.message);
  }

  // 6. Финальная перезагрузка с обходом HTTP-кэша ----------------------------
  log('Всё локальное состояние очищено. Перезагружаю страницу с обходом кэша…');
  await new Promise(r => setTimeout(r, 400)); // чтобы логи успели отрисоваться
  try {
    // Hard