// White Horse - PWA registration + Install prompt
(function() {
  // 1. سجّل service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('✅ PWA: SW مسجّل', reg.scope))
        .catch(err => console.warn('⚠️ PWA: فشل تسجيل SW', err));
    });
  }

  // 2. زر تثبيت التطبيق
  let deferredPrompt = null;
  let installBtn = null;

  function createInstallBtn() {
    if (installBtn) return installBtn;
    installBtn = document.createElement('button');
    installBtn.id = 'pwaInstallBtn';
    installBtn.innerHTML = '📲 تثبيت التطبيق';
    installBtn.title = 'ثبّت التطبيق على شاشتك الرئيسية';
    installBtn.style.cssText = `
      position: fixed; bottom: 20px; left: 20px; z-index: 9999;
      background: linear-gradient(to left, #b91c1c, #7f1d1d);
      color: white; border: none; border-radius: 50px;
      padding: 12px 20px; font-size: 14px; font-weight: bold;
      font-family: 'IBM Plex Sans Arabic', sans-serif;
      cursor: pointer; box-shadow: 0 4px 16px rgba(127,29,29,0.4);
      display: none; transition: transform 0.2s;
    `;
    installBtn.onmouseover = () => installBtn.style.transform = 'scale(1.05)';
    installBtn.onmouseout = () => installBtn.style.transform = 'scale(1)';
    installBtn.onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('PWA install:', outcome);
      deferredPrompt = null;
      installBtn.style.display = 'none';
    };
    document.body.appendChild(installBtn);
    return installBtn;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = createInstallBtn();
    // أظهر الزر بعد 3 ثواني (بدون إزعاج فوري)
    setTimeout(() => { btn.style.display = 'block'; }, 3000);
  });

  window.addEventListener('appinstalled', () => {
    console.log('✅ PWA: تم تثبيت التطبيق');
    if (installBtn) installBtn.style.display = 'none';
    deferredPrompt = null;
  });
})();
