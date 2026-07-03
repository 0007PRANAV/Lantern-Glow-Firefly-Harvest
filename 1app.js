/**
 * Lumina Forest Arcade Engine + Security Management Subsystem
 */

class SoundFXController {
    constructor() { this.ctx = null; this.enabled = true; this.vol = 0.7; }
    init() { if (!this.ctx && this.enabled) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    playTone(freq, type, duration, volMod) {
        if (!this.ctx || !this.enabled) return;
        try {
            let osc = this.ctx.createOscillator();
            let gainNode = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gainNode.gain.setValueAtTime(this.vol * volMod, this.ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
            osc.connect(gainNode); gainNode.connect(this.ctx.destination);
            osc.start(); osc.stop(this.ctx.currentTime + duration);
        } catch(e) {}
    }
    collect() { this.playTone(523.25, 'sine', 0.15, 0.15); setTimeout(() => this.playTone(659.25, 'sine', 0.2, 0.15), 60); }
    mothDamage() { this.playTone(120, 'sawtooth', 0.3, 0.25); }
    powerup() { this.playTone(440, 'triangle', 0.1, 0.2); setTimeout(() => this.playTone(880, 'triangle', 0.3, 0.2), 80); }
    bossHit() { this.playTone(180, 'square', 0.08, 0.15); }
}
const sfx = new SoundFXController();

// DOM Node Access Layers
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const viewport = document.getElementById('game-viewport');
const overlay = document.getElementById('screen-overlay');
const activeTray = document.getElementById('active-powerups-tray');
const toaster = document.getElementById('tutorial-toaster');
const globalQuitBtn = document.getElementById('global-quit-btn');
const globalSettingsBtn = document.getElementById('global-settings-btn');

// View Containers Routing System
let views = ['auth', 'start', 'settings', 'confirm-quit', 'guide', 'achievements', 'pause', 'gameover'];
let currentView = 'auth';

// User Datastore Database Schematics (Persistent Profile Registry)
let activeUser = null;
const STORAGE_KEY = 'lumina_account_vault';

function getVault() { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
function saveVault(vault) { localStorage.setItem(STORAGE_KEY, JSON.stringify(vault)); }

// Base Account Schematics Factory
function createDefaultAccount(username, password) {
    return {
        username: username,
        password: password,
        highScore: 0,
        quitCount: 0,
        penaltyUntil: 0,
        exitHistory: [],
        settings: { fxVol: 70, musicOn: true, controlMode: 'standard' },
        unlockedAchievements: []
    };
}

// Gameplay Engines & Matrix Tracks
let state = 'MENU'; // MENU, PLAY, PAUSE, GAMEOVER
let score = 0, multiplier = 1, maxCombo = 1, wave = 1;
let overdrive = 0, darkness = 0;
let entities = []; let particles = []; let indicators = [];
let spawnClock = 0;
let timers = { shield: 0, magnet: 0, chrono: 0 };

const achievements = [
    { id: 'first_light', name: 'First Ignition', desc: 'Harvest your first raw light particle', unlocked: false },
    { id: 'combo_10', name: 'Overdrive Chain', desc: 'Reach a X10 Combo Multiplier', unlocked: false },
    { id: 'boss_slayer', name: 'Eclipse Breaker', desc: 'Shatter the Wave 5 Harbinger Shield', unlocked: false }
];

function resizeCanvas() {
    canvas.width = viewport.offsetWidth;
    canvas.height = viewport.offsetHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function changeView(target) {
    views.forEach(v => document.getElementById(`view-${v}`).classList.remove('active'));
    document.getElementById(`view-${target}`).classList.add('active');
    currentView = target;
    
    // Top Bar Logic Context Visibility Switches
    if (state === 'PLAY') {
        globalQuitBtn.classList.remove('invisible');
    } else if (target === 'start') {
        globalQuitBtn.classList.add('invisible');
        syncProfileDashboard();
    } else {
        globalQuitBtn.classList.add('invisible');
    }
}

// Security Authentication Processing Modules
document.getElementById('btn-login-submit').addEventListener('click', () => {
    let u = document.getElementById('auth-username').value.trim();
    let p = document.getElementById('auth-password').value;
    if (!u || !p) { alert("Missing Pilot Credentials!"); return; }

    let vault = getVault();
    if (vault[u] && vault[u].password === p) {
        activeUser = vault[u];
        loginSuccess();
    } else if (vault[u]) {
        alert("Invalid Access Cipher!");
    } else {
        alert("Account schematic not found. Click Provision Account to build a new one!");
    }
});

document.getElementById('btn-register-submit').addEventListener('click', () => {
    let u = document.getElementById('auth-username').value.trim();
    let p = document.getElementById('auth-password').value;
    if (!u || !p) { alert("Credentials cannot be empty!"); return; }

    let vault = getVault();
    if (vault[u]) { alert("Pilot ID already allocated!"); return; }

    vault[u] = createDefaultAccount(u, p);
    saveVault(vault);
    activeUser = vault[u];
    alert(`Account allocated for ${u}! Welcome to the mainframe.`);
    loginSuccess();
});

function loginSuccess() {
    applyAccountSettings();
    changeView('start');
    // Save auto session token tracker persistence state
    localStorage.setItem('lumina_active_session', activeUser.username);
    processPenaltyTicker();
}

document.getElementById('btn-logout').addEventListener('click', () => {
    saveProfileToVault();
    activeUser = null;
    localStorage.removeItem('lumina_active_session');
    document.getElementById('auth-username').value = '';
    document.getElementById('auth-password').value = '';
    changeView('auth');
});

function saveProfileToVault() {
    if (!activeUser) return;
    let vault = getVault();
    vault[activeUser.username] = activeUser;
    saveVault(vault);
}

function applyAccountSettings() {
    let s = activeUser.settings;
    document.getElementById('setting-vol-fx').value = s.fxVol;
    document.getElementById('setting-music').checked = s.musicOn;
    document.getElementById('setting-controls').value = s.controlMode;
    sfx.vol = s.fxVol / 100;
    sfx.enabled = s.musicOn;
}

function syncProfileDashboard() {
    if (!activeUser) return;
    document.getElementById('user-display-name').innerHTML = `<i class="fas fa-user-shield"></i> ${activeUser.username.toUpperCase()}`;
    document.getElementById('start-hi-score').textContent = activeUser.highScore;
    document.getElementById('start-quit-count').textContent = activeUser.quitCount;
}

// Penalty Enforcement Matrix Engine Core
let penaltyInterval = null;
function processPenaltyTicker() {
    if (penaltyInterval) clearInterval(penaltyInterval);
    
    let banner = document.getElementById('penalty-lockout-banner');
    let display = document.getElementById('penalty-countdown-timer');
    let startPlayBtn = document.getElementById('btn-play');

    penaltyInterval = setInterval(() => {
        if (!activeUser) return;
        let now = Date.now();
        if (activeUser.penaltyUntil > now) {
            banner.classList.remove('hidden');
            startPlayBtn.disabled = true;
            startPlayBtn.style.opacity = "0.4";
            
            let diff = activeUser.penaltyUntil - now;
            let mins = Math.floor(diff / 60000);
            let secs = Math.floor((diff % 60000) / 1000);
            display.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
        } else {
            banner.classList.add('hidden');
            startPlayBtn.disabled = false;
            startPlayBtn.style.opacity = "1";
        }
    }, 1000);
}

// Leaver Penalty Interceptor Hooks
globalQuitBtn.addEventListener('click', () => {
    state = 'PAUSE';
    overlay.classList.add('active');
    changeView('confirm-quit');
    
    let warning = document.getElementById('quit-warning-text');
    let projectedQuits = activeUser.quitCount + 1;
    if (projectedQuits >= 3) {
        warning.innerHTML = `<span class="red-text"><i class="fas fa-exclamation-triangle"></i> PENALTY WARNING:</span> Quitting this simulation early now registers an infraction. Leaving now will issue a <strong>3-MINUTE LOCKOUT PENALTY</strong> instantly!`;
    } else {
        warning.innerHTML = `Are you sure you want to abandon this simulation timeline? (Infractions registered: ${activeUser.quitCount}/2 free allowances left).`;
    }
});

document.getElementById('btn-confirm-quit-no').addEventListener('click', () => {
    overlay.classList.remove('active');
    state = 'PLAY';
    gameLoop();
});

document.getElementById('btn-confirm-quit-yes').addEventListener('click', () => {
    activeUser.quitCount++;
    
    let timestamp = new Date().toLocaleTimeString();
    let logMessage = `Infraction logged at ${timestamp}`;

    if (activeUser.quitCount >= 3) {
        activeUser.penaltyUntil = Date.now() + 180000; // 3-minute lockout delay calculation
        logMessage += ` (3-Min Penalty Applied)`;
    }
    
    activeUser.exitHistory.unshift(logMessage);
    saveProfileToVault();
    
    state = 'MENU';
    processPenaltyTicker();
    changeView('start');
});

// Settings Modal Navigation Controllers
globalSettingsBtn.addEventListener('click', () => {
    if (!activeUser) { alert("Gain core system server entry first!"); return; }
    if (state === 'PLAY') state = 'PAUSE';
    overlay.classList.add('active');
    renderExitHistory();
    changeView('settings');
});

document.getElementById('settings-close-btn').addEventListener('click', () => {
    // Collect updated data configurations parameters profiles safely
    activeUser.settings.fxVol = parseInt(document.getElementById('setting-vol-fx').value);
    activeUser.settings.musicOn = document.getElementById('setting-music').checked;
    activeUser.settings.controlMode = document.getElementById('setting-controls').value;
    
    sfx.vol = activeUser.settings.fxVol / 100;
    sfx.enabled = activeUser.settings.musicOn;
    saveProfileToVault();

    if (canvas.style.display !== 'none' && score > 0) {
        // Return back to paused simulation state matrix arrays securely
        changeView('pause');
    } else {
        changeView('start');
    }
});

function renderExitHistory() {
    let list = document.getElementById('exit-history-list');
    list.innerHTML = '';
    if (activeUser.exitHistory.length === 0) {
        list.innerHTML = '<li class="empty-log">No registered compliance infractions logged.</li>';
        return;
    }
    activeUser.exitHistory.forEach(h => {
        let li = document.createElement('li');
        li.className = 'log-entry';
        li.innerHTML = `<span><i class="fas fa-ban red-text"></i> Early Exit Matrix Break</span> <small>${h}</small>`;
        list.appendChild(li);
    });
}

// Settings Deletion Operations (Data Management System Blocks)
document.getElementById('btn-reset-progress').addEventListener('click', () => {
    if (confirm("Reset simulation records? This wipes high scores and clears infraction data permanently!")) {
        activeUser.highScore = 0;
        activeUser.quitCount = 0;
        activeUser.penaltyUntil = 0;
        activeUser.exitHistory = [];
        activeUser.unlockedAchievements = [];
        saveProfileToVault();
        applyAccountSettings();
        alert("Progress data set back to system default initialization values.");
        renderExitHistory();
        syncProfileDashboard();
    }
});

document.getElementById('btn-delete-account').addEventListener('click', () => {
    if (confirm("CRITICAL WARNING: This completely purges your player profile and settings schematics from the local data registry vaults. Proceed?")) {
        let vault = getVault();
        delete vault[activeUser.username];
        saveVault(vault);
        
        activeUser = null;
        localStorage.removeItem('lumina_active_session');
        alert("Account structural telemetry entirely purged from core system layers.");
        changeView('auth');
    }
});

// Canvas Gameplay Interactive Event Coordinates Routers
function getCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}

function handleInput(pos) {
    if (state !== 'PLAY') return;
    sfx.init();

    let hit = false;
    let hitOffset = activeUser.settings.controlMode === 'forgiving' ? 36 : 24;

    for (let i = entities.length - 1; i >= 0; i--) {
        let ent = entities[i];
        let range = ent.isBoss ? ent.radius + 35 : ent.radius + hitOffset;
        if (Math.hypot(pos.x - ent.x, pos.y - ent.y) < range) {
            hit = true; processHit(ent, i);
            if (!ent.isBoss) return;
        }
    }
    if (!hit && timers.shield <= 0) { multiplier = 1; updateHUD(); }
}

canvas.addEventListener('mousedown', (e) => handleInput(getCoordinates(e)));
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleInput(getCoordinates(e)); });

// Engine Object Entities Blueprint Construction Structures
class Entity {
    constructor(type, waveNum) {
        this.type = type; this.isBoss = (type === 'boss'); this.pulse = Math.random() * Math.PI;
        if (this.isBoss) {
            this.x = canvas.width / 2; this.y = -100; this.targetY = canvas.height * 0.3;
            this.radius = 45; this.shieldHP = 25; this.maxShield = 25; this.vx = 1.2; this.vy = 1;
            return;
        }
        this.x = Math.random() * (canvas.width * 0.35);
        this.y = canvas.height * 0.2 + (Math.random() * (canvas.height * 0.4));
        this.radius = type.includes('firefly') ? 8 : (type === 'moth' ? 10 : 12);
        const tx = canvas.width * 0.72; const ty = canvas.height * 0.38;
        const angle = Math.atan2(ty - this.y, tx - this.x);
        const speed = (Math.random() * 1.2 + 0.8) * (1 + waveNum * 0.15);
        this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
    }
    update() {
        let factor = timers.chrono > 0 ? 0.45 : 1.0; this.pulse += 0.05;
        if (this.isBoss) {
            if (this.y < this.targetY) this.y += this.vy;
            else { this.x += this.vx * factor; if (this.x < 50 || this.x > canvas.width - 50) this.vx *= -1; }
            return;
        }
        if (timers.magnet > 0 && this.type === 'firefly') {
            const angle = Math.atan2((canvas.height*0.38)-this.y, (canvas.width*0.72)-this.x);
            this.vx = Math.cos(angle)*4; this.vy = Math.sin(angle)*4; factor = 1.0;
        }
        this.x += (this.vx + Math.sin(this.pulse) * 0.2) * factor;
        this.y += (this.vy + Math.cos(this.pulse) * 0.2) * factor;
    }
    draw() {
        ctx.save();
        if (this.isBoss) {
            let grad = ctx.createRadialGradient(this.x, this.y, 10, this.x, this.y, this.radius + 30);
            grad.addColorStop(0, '#a855f7'); grad.addColorStop(1, 'rgba(168,85,247,0)');
            ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 30, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 10, 0, (Math.PI*2) * (this.shieldHP / this.maxShield)); ctx.stroke();
            ctx.restore(); return;
        }
        let color = this.type === 'moth' ? '#ef4444' : '#fbbf24';
        let g = ctx.createRadialGradient(this.x, this.y, 1, this.x, this.y, this.radius * 2.2);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 2.2, 0, Math.PI*2); ctx.fill(); ctx.restore();
    }
}

class VisualFX {
    constructor(x, y, color) { this.x = x; this.y = y; this.color = color; this.vx = (Math.random()-0.5)*6; this.vy = (Math.random()-0.5)*6; this.alpha = 1; }
    update() { this.x += this.vx; this.y += this.vy; this.alpha -= 0.04; }
    draw() { ctx.save(); ctx.globalAlpha = this.alpha; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, 2.5, 0, Math.PI*2); ctx.fill(); ctx.restore(); }
}
class FloatText {
    constructor(x, y, str, color) { this.x = x; this.y = y; this.str = str; this.color = color; this.alpha = 1; }
    update() { this.y -= 1; this.alpha -= 0.03; }
    draw() { ctx.save(); ctx.globalAlpha = this.alpha; ctx.fillStyle = this.color; ctx.font = '900 12px "Orbitron"'; ctx.textAlign = 'center'; ctx.fillText(this.str, this.x, this.y); ctx.restore(); }
}

function processHit(ent, index) {
    if (ent.isBoss) {
        ent.shieldHP--; sfx.bossHit(); spawnExplosion(ent.x, ent.y, '#c084fc', 4);
        if (ent.shieldHP <= 0) {
            score += 2000 * multiplier; entities.splice(index, 1); spawnExplosion(ent.x, ent.y, '#ffffff', 40); showToast("✨ HARBINGER SHATTERED! +2000");
        }
        return;
    }
    entities.splice(index, 1);
    if (ent.type === 'moth') {
        if (timers.shield > 0) { timers.shield = 0; showToast("🛡️ SHIELD BROKEN"); }
        else { multiplier = 1; darkness = Math.min(100, darkness + 22); sfx.mothDamage(); triggerViewportShake(); }
    } else {
        sfx.init(); sfx.collect(); score += 10 * multiplier;
        overdrive = Math.min(100, overdrive + 4); darkness = Math.max(0, darkness - 12); multiplier++;
        indicators.push(new FloatText(ent.x, ent.y, `+${10 * multiplier}`, '#fbbf24')); spawnExplosion(ent.x, ent.y, '#fbbf24', 12);
    }
    updateHUD();
}

function spawnExplosion(x, y, color, qty) { for (let i = 0; i < qty; i++) particles.push(new VisualFX(x, y, color)); }
function triggerViewportShake() { viewport.classList.add('shake-viewport'); setTimeout(() => viewport.classList.remove('shake-viewport'), 250); }
function showToast(str) { toaster.textContent = str; toaster.classList.add('active'); setTimeout(() => toaster.classList.remove('active'), 2500); }

const hScore = document.getElementById('hud-score');
const hMult = document.getElementById('hud-multiplier');
const hWave = document.getElementById('hud-wave');
const hOdrive = document.getElementById('overdrive-fill');
const hDarkness = document.getElementById('darkness-fill');

function updateHUD() {
    hScore.textContent = String(score).padStart(5, '0'); hMult.textContent = `X${multiplier}`; hWave.textContent = wave;
    hOdrive.style.width = `${overdrive}%`; hDarkness.style.width = `${darkness}%`;
}

function announceWave() {
    document.getElementById('announcement-title').textContent = `WAVE ${wave}`;
    document.getElementById('announcement-subtitle').textContent = wave === 5 ? "BOSS ECLIPSE INBOUND" : "The Neon Storm Thickens";
    document.getElementById('announcement-banner').classList.add('active');
    setTimeout(() => document.getElementById('announcement-banner').classList.remove('active'), 2000);
}

function gameLoop() {
    if (state !== 'PLAY') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    darkness += 0.06 + (wave * 0.012);
    if (darkness >= 100) { state = 'GAMEOVER'; evalGameOver(); return; }

    spawnClock++;
    if (spawnClock > Math.max(16, 40 - wave * 3)) {
        spawnClock = 0; entities.push(new Entity(Math.random() > 0.35 ? 'firefly' : 'moth', wave));
    }
    if (score > wave * wave * 900) { wave++; if (wave === 5) entities.push(new Entity('boss', wave)); announceWave(); }

    for (let i = entities.length - 1; i >= 0; i--) {
        entities[i].update(); entities[i].draw();
        if (entities[i].x > canvas.width * 0.72 && entities[i].y < canvas.height * 0.44 && !entities[i].isBoss) {
            if (entities[i].type === 'firefly') darkness = Math.max(0, darkness - 4);
            entities.splice(i,1);
        }
    }
    for(let i=particles.length-1; i>=0; i--) { particles[i].update(); particles[i].draw(); if(particles[i].alpha <= 0) particles.splice(i,1); }
    for(let i=indicators.length-1; i>=0; i--) { indicators[i].update(); indicators[i].draw(); if(indicators[i].alpha <= 0) indicators.splice(i,1); }

    updateHUD();
    requestAnimationFrame(gameLoop);
}

document.getElementById('btn-play').addEventListener('click', () => {
    overlay.classList.remove('active');
    document.getElementById('game-hud').classList.add('active');
    state = 'PLAY'; score = 0; multiplier = 1; wave = 1; darkness = 0; overdrive = 0;
    entities = []; particles = []; indicators = []; announceWave(); gameLoop();
});

document.getElementById('pause-trigger-btn').addEventListener('click', () => { state = 'PAUSE'; overlay.classList.add('active'); changeView('pause'); });
document.getElementById('btn-resume').addEventListener('click', () => { overlay.classList.remove('active'); state = 'PLAY'; gameLoop(); });

function evalGameOver() {
    overlay.classList.add('active'); changeView('gameover');
    document.getElementById('res-score').textContent = score;
    document.getElementById('res-combo').textContent = `X${maxCombo}`;
    document.getElementById('res-waves').textContent = wave;
    if (score > activeUser.highScore) activeUser.highScore = score;
    saveProfileToVault();
}

document.getElementById('btn-retry').addEventListener('click', () => document.getElementById('btn-play').click());
document.getElementById('btn-guide').addEventListener('click', () => changeView('guide'));
document.getElementById('guide-back').addEventListener('click', () => changeView('start'));
document.getElementById('btn-trophy').addEventListener('click', () => {
    changeView('achievements');
    const c = document.getElementById('achievements-list-container'); c.innerHTML = '';
    achievements.forEach(a => {
        let div = document.createElement('div'); div.className = `ach-item`;
        div.innerHTML = `<div class="icon-badge"><i class="fas fa-lock"></i></div><div><h4>${a.name}</h4><p>${a.desc}</p></div>`;
        c.appendChild(div);
    });
});
document.getElementById('ach-back').addEventListener('click', () => changeView('start'));

// Session Auto-Login Lifecycle Hook Checks
window.addEventListener('load', () => {
    let savedSession = localStorage.getItem('lumina_active_session');
    if (savedSession) {
        let vault = getVault();
        if (vault[savedSession]) {
            activeUser = vault[savedSession];
            loginSuccess();
        }
    }
});