(function() {
    console.log('🧹 Начинаем полную очистку...');
    
    // 1. LocalStorage и SessionStorage
    try {
        localStorage.clear();
        sessionStorage.clear();
        console.log('✅ Local/Session Storage очищены');
    } catch(e) { console.warn('⚠️ Ошибка очистки Storage:', e); }

    // 2. Cookies
    try {
        document.cookie.split(";").forEach(c => {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        console.log('✅ Cookies удалены');
    } catch(e) { console.warn('⚠️ Ошибка очистки Cookies:', e); }

    // 3. Cache API
    try {
        if ('caches' in window) {
            caches.keys().then(names => names.forEach(name => caches.delete(name)));
            console.log('✅ Cache API очищен');
        }
    } catch(e) { console.warn('⚠️ Ошибка очистки Cache:', e); }

    // 4. Service Workers
    try {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.unregister()));
            console.log('✅ Service Workers отключены');
        }
    } catch(e) { console.warn('⚠️ Ошибка отключения SW:', e); }

    // 5. Перезагрузка с игнорированием кэша
    console.log('🚀 Перезагрузка...');
    setTimeout(() => window.location.reload(true), 500);
})();