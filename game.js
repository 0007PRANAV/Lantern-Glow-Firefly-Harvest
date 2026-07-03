/**
 * Lumina Forest Arcade Engine Code Configuration
 */

// Audio Synth Hook Layer Implementation
class SoundFXController {
    constructor() {
        this.ctx = null;
    }
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }
    playTone(freq, type, duration, vol) {
        if (!this.ctx) return;
        try {
            let osc = this.ctx.createOscillator();
            let gainNode = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gainNode.gain.setValueAtTime(vol, this.ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
            osc.connect(gainNode);
            gainNode.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch(e) {}
    }
    collect() { this.playTone(523.25, 'sine', 0.15, 0.15); setTimeout(() => this.playTone(659.25, 'sine', 0.2, 0.15), 60); }
    mothDamage() { this.playTone(120, 'sawtooth', 0.3, 0.25); }
    powerup() { this.playTone(440, 'triangle', 0.1, 0.2); setTimeout(() => this.playTone(880, 'triangle', 0.3, 0.2), 80); }
    bossHit() { this.playTone(180, 'square', 0.08, 0.15); }
}
const sfx = new SoundFXController();

// DOM Node References
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const viewport = document.getElementById('game-viewport');
const overlay = document.getElementById('screen-overlay');
const activeTray = document.getElementById('active-powerups-tray');
const toaster = document.getElementById('tutorial-toaster');

// HUD DOM updates
const hScore = document.getElementById('hud-score');
const hMult = document.getElementById('hud-multiplier');
const hWave = document.getElementById('hud-wave');
const hOdrive = document.getElementById('overdrive-fill');
const hDarkness = document.getElementById('darkness-fill');

// Achievements System Setup
const achievements = [
    { id: 'first_light', name: 'First Ignition', desc: 'Harvest your first raw light particle', unlocked: false },
    { id: 'combo_10', name: 'Overdrive Chain', desc: 'Reach a X10 Combo Multiplier', unlocked: false },
    { id: 'boss_slayer', name: 'Eclipse Breaker', desc: 'Shatter the Wave 5 Harbinger Shield', unlocked: false },
    { id: 'survive_5', name: 'Forest dweller', desc: 'Reach Wave 5 survival timeline', unlocked: false }
];

function initAchievements() {
    const saved = localStorage.getItem('lumina_achievements');
    if (saved) {
        const parsed = JSON.parse(saved);
        achievements.forEach(a => { if(parsed.includes(a.id)) a.unlocked = true; });
    }
}
function unlockAchievement(id) {
    const ach = achievements.find(a => a.id === id);
    if (ach && !ach.unlocked) {
        ach.unlocked = true;
        localStorage.setItem('lumina_achievements', JSON.stringify(achievements.filter(a => a.unlocked).map(a => a.id)));
        showToast(`🏆 UNLOCKED: ${ach.name}`);
    }
}

// Global Core System Variables
let state = 'START'; // START, PLAY, PAUSE, GAMEOVER
let score = 0, multiplier = 1, maxCombo = 1, wave = 1;
let overdrive = 0, darkness = 0; // Darkness acts as core timer countdown health

let entities = [];
let particles = [];
let indicators = [];
let spawnClock = 0;

// Active Power-up Global Timers
let timers = { shield: 0, magnet: 0, chrono: 0 };

function resizeCanvas() {
    canvas.width = viewport.offsetWidth;
    canvas.height = viewport.offsetHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Interactive Controls Routing Hooks
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
    for (let i = entities.length - 1; i >= 0; i--) {
        let ent = entities[i];
        let range = ent.isBoss ? ent.radius + 35 : ent.radius + 28;
        if (Math.hypot(pos.x - ent.x, pos.y - ent.y) < range) {
            hit = true;
            processHit(ent, i);
            if (!ent.isBoss) return; // Stop cascade evaluation on single targets
        }
    }

    if (!hit && timers.shield <= 0) {
        multiplier = 1;
        updateHUD();
    }
}

canvas.addEventListener('mousedown', (e) => handleInput(getCoordinates(e)));
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleInput(getCoordinates(e)); });

// Engine Class Modules Definitions
class Entity {
    constructor(type, waveNum) {
        this.type = type; // firefly, golden, moth, shield, magnet, chrono, boss
        this.isBoss = (type === 'boss');
        this.pulse = Math.random() * Math.PI;
        
        if (this.isBoss) {
            this.x = canvas.width / 2;
            this.y = -100;
            this.targetY = canvas.height * 0.3;
            this.radius = 45;
            this.shieldHP = 25;
            this.maxShield = 25;
            this.vx = 1.2;
            this.vy = 1;
            return;
        }

        // Standard Spawning Algorithms
        this.x = Math.random() * (canvas.width * 0.35);
        this.y = canvas.height * 0.2 + (Math.random() * (canvas.height * 0.4));
        this.radius = type.includes('firefly') ? 8 : (type === 'moth' ? 10 : 12);
        
        const tx = canvas.width * 0.72;
        const ty = canvas.height * 0.38;
        const angle = Math.atan2(ty - this.y, tx - this.x);
        const speed = (Math.random() * 1.2 + 0.8) * (1 + waveNum * 0.1);
        
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
    }

    update() {
        let factor = timers.chrono > 0 ? 0.45 : 1.0;
        this.pulse += 0.05;

        if (this.isBoss) {
            if (this.y < this.targetY) {
                this.y += this.vy;
            } else {
                this.x += this.vx * factor;
                if (this.x < 50 || this.x > canvas.width - 50) this.vx *= -1;
            }
            return;
        }

        // Magnet Collection physics force redirection pull loop
        if (timers.magnet > 0 && (this.type === 'firefly' || this.type === 'golden')) {
            const mx = canvas.width * 0.72;
            const my = canvas.height * 0.38;
            const angle = Math.atan2(my - this.y, mx - this.x);
            this.vx = Math.cos(angle) * 4;
            this.vy = Math.sin(angle) * 4;
            factor = 1.0; // Force break slow motion constraints
        }

        this.x += (this.vx + Math.sin(this.pulse) * 0.2) * factor;
        this.y += (this.vy + Math.cos(this.pulse) * 0.2) * factor;
    }

    draw() {
        ctx.save();
        if (this.isBoss) {
            // Boss Render Configuration
            let grad = ctx.createRadialGradient(this.x, this.y, 10, this.x, this.y, this.radius + 30);
            grad.addColorStop(0, '#a855f7');
            grad.addColorStop(1, 'rgba(168,85,247,0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 30, 0, Math.PI*2); ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 10, 0, (Math.PI*2) * (this.shieldHP / this.maxShield));
            ctx.stroke();
            ctx.restore();
            return;
        }

        // Standard Particle entity glows loops mapping
        let color = '#fbbf24';
        if (this.type === 'golden') color = '#38bdf8';
        if (this.type === 'moth') color = '#ef4444';
        if (this.type === 'shield') color = '#10b981';
        if (this.type === 'magnet') color = '#a855f7';
        if (this.type === 'chrono') color = '#06b6d4';

        let g = ctx.createRadialGradient(this.x, this.y, 1, this.x, this.y, this.radius * 2.2);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.3, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 2.2, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    }
}

class VisualFX {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = (Math.random() - 0.5) * 6;
        this.alpha = 1;
    }
    update() { this.x += this.vx; this.y += this.vy; this.alpha -= 0.04; }
    draw() {
        ctx.save(); ctx.globalAlpha = this.alpha; ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, 2.5, 0, Math.PI*2); ctx.fill(); ctx.restore();
    }
}

class FloatText {
    constructor(x, y, str, color) {
        this.x = x; this.y = y; this.str = str; this.color = color; this.alpha = 1;
    }
    update() { this.y -= 1; this.alpha -= 0.03; }
    draw() {
        ctx.save(); ctx.globalAlpha = this.alpha; ctx.fillStyle = this.color;
        ctx.font = '900 12px "Orbitron"'; ctx.textAlign = 'center';
        ctx.fillText(this.str, this.x, this.y); ctx.restore();
    }
}

// Gameplay Loop Systems Logic Engine
function processHit(ent, index) {
    if (ent.isBoss) {
        ent.shieldHP--;
        sfx.bossHit();
        spawnExplosion(ent.x, ent.y, '#c084fc', 4);
        if (ent.shieldHP <= 0) {
            score += 2000 * multiplier;
            unlockAchievement('boss_slayer');
            entities.splice(index, 1);
            spawnExplosion(ent.x, ent.y, '#ffffff', 40);
            showToast("✨ HARBINGER SHATTERED! +2000");
        }
        return;
    }

    // Processing Drops
    entities.splice(index, 1);
    if (ent.type === 'moth') {
        if (timers.shield > 0) {
            timers.shield = 0; // Break Shield protection
            showToast("🛡️ SHIELD BROKEN");
        } else {
            multiplier = 1;
            darkness = Math.min(100, darkness + 22);
            sfx.mothDamage();
            triggerViewportShake();
        }
    } else if (ent.type === 'firefly' || ent.type === 'golden') {
        sfx.collect();
        unlockAchievement('first_light');
        let bonus = ent.type === 'golden' ? 40 : 10;
        score += bonus * multiplier;
        overdrive = Math.min(100, overdrive + (ent.type === 'golden' ? 15 : 4));
        darkness = Math.max(0, darkness - 12);
        
        multiplier++;
        if (multiplier >= 10) unlockAchievement('combo_10');
        
        indicators.push(new FloatText(ent.x, ent.y, `+${bonus * multiplier}`, '#fbbf24'));
        spawnExplosion(ent.x, ent.y, ent.type === 'golden' ? '#38bdf8' : '#fbbf24', 12);
    } else {
        // Powerups collected mapping routing state configuration
        sfx.powerup();
        timers[ent.type] = 400; // Activation ticks window
        indicators.push(new FloatText(ent.x, ent.y, `${ent.type.toUpperCase()} ACTIVE`, '#10b981'));
        spawnExplosion(ent.x, ent.y, '#10b981', 20);
    }
    updateHUD();
}

function spawnExplosion(x, y, color, qty) {
    for (let i = 0; i < qty; i++) particles.push(new VisualFX(x, y, color));
}

function triggerViewportShake() {
    viewport.classList.add('shake-viewport');
    setTimeout(() => viewport.classList.remove('shake-viewport'), 250);
}

function showToast(str) {
    toaster.textContent = str;
    toaster.classList.add('active');
    setTimeout(() => toaster.classList.remove('active'), 2500);
}

function updateHUD() {
    hScore.textContent = String(score).padStart(5, '0');
    hMult.textContent = `X${multiplier}`;
    hWave.textContent = wave;
    hOdrive.style.width = `${overdrive}%`;
    hDarkness.style.width = `${darkness}%`;

    // Process Active Buff Icons rendering on layout containers
    activeTray.innerHTML = '';
    Object.keys(timers).forEach(k => {
        if (timers[k] > 0) {
            let b = document.createElement('span');
            b.className = 'tray-badge';
            b.textContent = `${k.toUpperCase()} (${Math.ceil(timers[k]/60)}s)`;
            activeTray.appendChild(b);
        }
    });
}

function announceWave() {
    document.getElementById('announcement-title').textContent = `WAVE ${wave}`;
    const sub = document.getElementById('announcement-subtitle');
    if(wave === 5) sub.textContent = "BOSS ECLIPSE INBOUND";
    else sub.textContent = "The Neon Storm Thickens";
    
    document.getElementById('announcement-banner').classList.add('active');
    setTimeout(() => document.getElementById('announcement-banner').classList.remove('active'), 2000);
}

function gameLoop() {
    if (state !== 'PLAY') return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Natural escalation darkness processing loop
    darkness += 0.06 + (wave * 0.012);
    if (darkness >= 100) {
        state = 'GAMEOVER';
        evalGameOver();
        return;
    }

    // Tick Down power-up counters window frames
    Object.keys(timers).forEach(k => { if(timers[k] > 0) timers[k]--; });

    // Spawning loop matrix logic configurations step cycles
    spawnClock++;
    if (spawnClock > Math.max(16, 40 - wave * 3)) {
        spawnClock = 0;
        let pUpChance = Math.random();
        if (pUpChance > 0.96) {
            let types = ['shield', 'magnet', 'chrono'];
            entities.push(new Entity(types[Math.floor(Math.random() * types.length)], wave));
        } else {
            entities.push(new Entity(Math.random() > 0.3 ? 'firefly' : 'moth', wave));
        }
    }

    // Adaptive dynamic wave system threshold steps logic routing
    if (score > wave * wave * 900) {
        wave++;
        if (wave === 5) unlockAchievement('survive_5');
        if (wave === 5) entities.push(new Entity('boss', wave));
        announceWave();
    }

    // Refresh Collections Arrays rendering stack traces updates safely
    for(let i=entities.length-1; i>=0; i--) {
        entities[i].update();
        entities[i].draw();
        // Safe check boundary cleanup logic execution tracking array loops
        if (entities[i].x > canvas.width * 0.72 && entities[i].y < canvas.height * 0.44 && !entities[i].isBoss) {
            if (entities[i].type === 'firefly') darkness = Math.max(0, darkness - 4);
            entities.splice(i,1);
        }
    }
    
    for(let i=particles.length-1; i>=0; i--) {
        particles[i].update(); particles[i].draw();
        if(particles[i].alpha <= 0) particles.splice(i,1);
    }
    for(let i=indicators.length-1; i>=0; i--) {
        indicators[i].update(); indicators[i].draw();
        if(indicators[i].alpha <= 0) indicators.splice(i,1);
    }

    updateHUD();
    requestAnimationFrame(gameLoop);
}

// State Control Router Actions Interface Buttons Mapping Configuration Layers
function setViewState(viewName) {
    document.querySelectorAll('.menu-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    if(viewName === 'start') {
        document.getElementById('start-hi-score').textContent = localStorage.getItem('lumina_high') || 0;
    }
}

document.getElementById('btn-play').addEventListener('click', () => {
    overlay.classList.remove('active');
    document.getElementById('game-hud').classList.add('active');
    state = 'PLAY';
    score = 0; multiplier = 1; wave = 1; darkness = 0; overdrive = 0;
    entities = []; particles = []; indicators = [];
    timers = { shield:0, magnet:0, chrono:0 };
    announceWave();
    gameLoop();
});

document.getElementById('pause-trigger-btn').addEventListener('click', () => {
    state = 'PAUSE';
    overlay.classList.add('active');
    setViewState('pause');
});
document.getElementById('btn-resume').addEventListener('click', () => {
    overlay.classList.remove('active');
    state = 'PLAY';
    gameLoop();
});

function evalGameOver() {
    overlay.classList.add('active');
    setViewState('gameover');
    document.getElementById('res-score').textContent = score;
    document.getElementById('res-combo').textContent = `X${maxCombo}`;
    document.getElementById('res-waves').textContent = wave;
    
    let hi = parseInt(localStorage.getItem('lumina_high') || 0);
    if(score > hi) localStorage.setItem('lumina_high', score);
}

document.getElementById('btn-retry').addEventListener('click', () => document.getElementById('btn-play').click());
document.getElementById('btn-pause-quit').addEventListener('click', () => { setViewState('start'); updateHUD(); });
document.getElementById('btn-gameover-quit').addEventListener('click', () => setViewState('start'));

document.getElementById('btn-guide').addEventListener('click', () => setViewState('guide'));
document.getElementById('guide-back').addEventListener('click', () => setViewState('start'));

document.getElementById('btn-trophy').addEventListener('click', () => {
    setViewState('achievements');
    const container = document.getElementById('achievements-list-container');
    container.innerHTML = '';
    achievements.forEach(a => {
        let div = document.createElement('div');
        div.className = `ach-item ${a.unlocked ? 'unlocked' : ''}`;
        div.innerHTML = `
            <div class="icon-badge"><i class="fas ${a.unlocked ? 'fa-check' : 'fa-lock'}"></i></div>
            <div><h4>${a.name}</h4><p>${a.desc}</p></div>
        `;
        container.appendChild(div);
    });
});
document.getElementById('ach-back').addEventListener('click', () => setViewState('start'));

// Initial configurations processing loop triggers initialization setup entries
initAchievements();
setViewState('start');
