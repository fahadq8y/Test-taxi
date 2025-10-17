// ==================== GPS TRACKING CODE ====================

let trackingActive = false;
let watchId = null;
let wakeLock = null;
let trackingInterval = null;

// Wait for driver ID to be available
function initializeTracking() {
    const driverId = sessionStorage.getItem('driverId');
    if (!driverId) {
        console.warn('No driver ID available yet');
        setTimeout(initializeTracking, 1000); // Retry after 1 second
        return;
    }
    
    console.log('Initializing tracking for driver:', driverId);
    setupTrackingUI();
    
    // Start tracking automatically after a short delay
    setTimeout(() => {
        startTracking();
        console.log('Auto-started tracking');
    }, 500);
}

// Setup tracking UI
function setupTrackingUI() {
    const trackingIndicator = document.getElementById('trackingIndicator');
    const trackingStatusText = document.getElementById('trackingStatusText');
    const startBtn = document.getElementById('startTrackingBtn');
    const stopBtn = document.getElementById('stopTrackingBtn');
    const wakeLockBtn = document.getElementById('wakeLockBtn');
    
    if (!trackingIndicator) {
        console.error('Tracking UI elements not found');
        return;
    }
    
    // Initialize UI
    trackingIndicator.classList.add('inactive');
    
    // Hide start/stop buttons since tracking is automatic
    const controlsDiv = document.querySelector('.tracking-controls');
    if (controlsDiv) {
        controlsDiv.style.display = 'none';
    }
    
    // Button event listeners (kept for potential manual control)
    startBtn.addEventListener('click', startTracking);
    stopBtn.addEventListener('click', stopTracking);
    wakeLockBtn.addEventListener('click', toggleWakeLock);
    
    // Re-acquire wake lock when page becomes visible
    document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake Lock re-acquired');
            } catch (err) {
                console.error('Wake Lock re-acquire error:', err);
            }
        }
    });
    
    console.log('GPS Tracking UI initialized');
}

// Send location to Firebase
async function sendLocation(position) {
    const driverId = sessionStorage.getItem('driverId');
    if (!driverId) {
        console.error('No driver ID available');
        return;
    }
    
    const locationData = {
        driverId: driverId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed || 0,
        heading: position.coords.heading || 0,
        timestamp: new Date(),
        localTime: new Date().toISOString()
    };
    
    try {
        // Use global Firebase instances
        const { setDoc } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js');
        await setDoc(window.doc(window.db, 'driverLocations', driverId), locationData);
        
        // Update UI
        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('ar-SA');
        document.getElementById('currentLocation').textContent = 
            `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
        document.getElementById('currentSpeed').textContent = 
            `${((position.coords.speed || 0) * 3.6).toFixed(1)} كم/س`;
        document.getElementById('accuracy').textContent = 
            `${position.coords.accuracy.toFixed(0)} متر`;
        
        console.log('Location sent:', locationData);
    } catch (error) {
        console.error('Error sending location:', error);
    }
}

// Handle location errors
function handleLocationError(error) {
    console.error('Location error:', error);
    let errorMsg = '';
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMsg = 'تم رفض إذن الموقع';
            alert(errorMsg + '\n\nيرجى السماح بالوصول للموقع في إعدادات المتصفح');
            stopTracking();
            break;
        case error.POSITION_UNAVAILABLE:
            errorMsg = 'الموقع غير متاح';
            break;
        case error.TIMEOUT:
            errorMsg = 'انتهت مهلة الحصول على الموقع';
            break;
        default:
            errorMsg = 'خطأ غير معروف';
    }
    
    console.error(errorMsg);
}

// Start tracking
function startTracking() {
    if (!('geolocation' in navigator)) {
        alert('المتصفح لا يدعم تحديد الموقع');
        return;
    }
    
    const driverId = sessionStorage.getItem('driverId');
    if (!driverId) {
        alert('يرجى تسجيل الدخول أولاً');
        return;
    }
    
    // Start watching position
    watchId = navigator.geolocation.watchPosition(
        sendLocation,
        handleLocationError,
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
    
    // Also send location every 30 seconds
    trackingInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(sendLocation, handleLocationError);
    }, 30000);
    
    // Update UI
    trackingActive = true;
    const trackingIndicator = document.getElementById('trackingIndicator');
    const trackingStatusText = document.getElementById('trackingStatusText');
    const startBtn = document.getElementById('startTrackingBtn');
    const stopBtn = document.getElementById('stopTrackingBtn');
    
    trackingIndicator.classList.add('active');
    trackingIndicator.classList.remove('inactive');
    trackingStatusText.textContent = 'نشط';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    
    console.log('Tracking started');
}

// Stop tracking
function stopTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
    
    // Update UI
    trackingActive = false;
    const trackingIndicator = document.getElementById('trackingIndicator');
    const trackingStatusText = document.getElementById('trackingStatusText');
    const startBtn = document.getElementById('startTrackingBtn');
    const stopBtn = document.getElementById('stopTrackingBtn');
    
    trackingIndicator.classList.remove('active');
    trackingIndicator.classList.add('inactive');
    trackingStatusText.textContent = 'غير نشط';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    
    console.log('Tracking stopped');
}

// Toggle Wake Lock
async function toggleWakeLock() {
    const wakeLockBtn = document.getElementById('wakeLockBtn');
    
    if (!('wakeLock' in navigator)) {
        alert('متصفحك لا يدعم Wake Lock API');
        return;
    }
    
    try {
        if (wakeLock !== null) {
            // Release wake lock
            await wakeLock.release();
            wakeLock = null;
            wakeLockBtn.textContent = '🔒 منع الشاشة من الإغلاق';
            wakeLockBtn.classList.remove('active');
            console.log('Wake Lock released');
        } else {
            // Request wake lock
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLockBtn.textContent = '✅ الشاشة مفعّلة دائماً';
            wakeLockBtn.classList.add('active');
            console.log('Wake Lock acquired');
            
            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock was released');
            });
        }
    } catch (err) {
        console.error('Wake Lock error:', err);
        alert('خطأ: ' + err.message);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initializeTracking, 1000); // Wait for driver data to load
    });
} else {
    setTimeout(initializeTracking, 1000);
}

