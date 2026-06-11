/* Admin Panel Functions - Standalone */

let adminQuestionsCache = [];
let adminRulesCache = {};
let adminTiersCache = [];
let adminCameraRotation = 0;
let adminCameraMirror = false;
let adminCameraStream = null;

// Initialize admin panel
function initAdminPanel() {
    const adminBack = document.getElementById('admin-back');
    const adminTabs = document.querySelectorAll('.admin-tab');

    if (!adminBack) return;

    // Back button handler
    adminBack.addEventListener('click', () => {
        cleanupCameraStream();
        window.location.href = '/';
    });

    // Tab switching
    adminTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            switchAdminTab(tabName);
        });
    });

    // Event listeners for buttons
    document.getElementById('add-question-btn')?.addEventListener('click', openQuestionForm);
    document.getElementById('add-tier-btn')?.addEventListener('click', addNewTierForm);
    document.getElementById('save-rules-btn')?.addEventListener('click', saveRules);
    document.getElementById('export-btn')?.addEventListener('click', exportData);
    document.getElementById('save-camera-settings-btn')?.addEventListener('click', saveCameraSettings);

    // Camera rotation buttons
    document.querySelectorAll('.rotation-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const angle = parseInt(e.target.dataset.angle);
            selectRotationAngle(angle);
        });
    });

    // Flip button
    document.getElementById('flip-btn')?.addEventListener('click', toggleCameraMirror);

    // Load admin data on page load
    loadAdminData();
}

function switchAdminTab(tabName) {
    // Update button styles
    document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

    // Update content
    document.querySelectorAll('.admin-tab-content').forEach(c => {
        c.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`)?.classList.add('active');

    // Load data when switching to specific tabs
    if (tabName === 'questions') {
        loadAdminQuestions();
    } else if (tabName === 'camera') {
        loadAdminCameraSettings();
    } else if (tabName === 'rules') {
        loadAdminRules();
    }
}

async function loadAdminData() {
    await loadAdminQuestions();
    await loadAdminRules();
}

async function loadAdminQuestions() {
    try {
        const res = await fetch('/api/admin/questions');
        if (res.ok) {
            adminQuestionsCache = await res.json();
            renderQuestionsList();
        }
    } catch (e) {
        console.error('Failed to load questions for admin:', e);
    }
}

function renderQuestionsList() {
    const container = document.getElementById('questions-list');
    if (!container) return;

    container.innerHTML = '';

    adminQuestionsCache.forEach((q, idx) => {
        const div = document.createElement('div');
        div.className = 'question-item';

        const optionsHtml = q.options?.map(o =>
            `<div class="option-item"><strong>${o.label}:</strong> ${o.text}</div>`
        ).join('') || '';

        const correctLabel = q.options?.find(o => o.label === q.correct)?.label || q.correct;

        div.innerHTML = `
            <div class="question-item-header">
                <div class="question-item-text">${q.question}</div>
                <div class="question-item-actions">
                     
                    <button class="btn-delete" onclick="deleteQuestion(${idx})">🗑️ Избриши</button>
                </div>
            </div>
            <div class="question-options">
                <div style="margin-bottom: 8px; color: #ff3da0; font-weight: 600;">Опции:</div>
                ${optionsHtml}
                <div style="margin-top: 8px; color: #ffd700; font-weight: 600;">✓ Точен одговор: ${correctLabel}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

async function loadAdminRules() {
    try {
        const res = await fetch('/api/admin/quiz_rules');
        if (res.ok) {
            adminRulesCache = await res.json();
            renderRulesForm();
        }
    } catch (e) {
        console.error('Failed to load rules for admin:', e);
    }
}

function renderRulesForm() {
    const rules = adminRulesCache;

    document.getElementById('points-correct').value = rules.points?.correct || 50;
    document.getElementById('points-wrong').value = rules.points?.wrong || -20;
    document.getElementById('score-floor').value = rules.score_floor || 0;
    document.getElementById('wrong-message').value = rules.wrong_answer_message || '';

    adminTiersCache = JSON.parse(JSON.stringify(rules.tiers || []));
    renderTiersList();
}

function renderTiersList() {
    const container = document.getElementById('tiers-list');
    if (!container) return;

    container.innerHTML = '';

    adminTiersCache.forEach((tier, idx) => {
        const div = document.createElement('div');
        div.className = 'tier-item';

        const minMax = tier.max === null ? `${tier.min}+` : `${tier.min}-${tier.max}`;

        div.innerHTML = `
            <div class="tier-info">
                <div class="tier-name">${tier.name}</div>
                <div class="tier-range">Поени: ${minMax}</div>
            </div>
            <button class="btn-tier-delete" onclick="deleteTier(${idx})">Избриши</button>
        `;
        container.appendChild(div);
    });
}

function openQuestionForm() {
    const question = prompt('Внеси прашање:');
    if (!question) return;

    const numOptions = prompt('Број на опции (2-4):', '3');
    const n = parseInt(numOptions);
    if (!n || n < 2 || n > 4) {
        alert('Мора да има 2-4 опции');
        return;
    }

    const options = [];
    const labels = ['A', 'B', 'C', 'D'];

    for (let i = 0; i < n; i++) {
        const text = prompt(`Опција ${labels[i]}:`);
        if (!text) return;
        options.push({ label: labels[i], text });
    }

    const correctPrompt = prompt(`Кој е точниот одговор? (${labels.slice(0, n).join(', ')}):`);
    if (!correctPrompt || !labels.slice(0, n).includes(correctPrompt.toUpperCase())) {
        alert('Невалиден одговор');
        return;
    }

    const newQuestion = {
        id: (adminQuestionsCache[adminQuestionsCache.length - 1]?.id || 0) + 1,
        question,
        correct: correctPrompt.toUpperCase(),
        options
    };

    adminQuestionsCache.push(newQuestion);
    renderQuestionsList();
    saveQuestions();
}

function editQuestion(idx) {
    const q = adminQuestionsCache[idx];
    const newQuestion = prompt('Уреди прашање:', q.question);
    if (newQuestion) {
        adminQuestionsCache[idx].question = newQuestion;
        renderQuestionsList();
        saveQuestions();
    }
}

function deleteQuestion(idx) {
    if (confirm('Сигурен/на си?')) {
        adminQuestionsCache.splice(idx, 1);
        renderQuestionsList();
        saveQuestions();
    }
}

async function saveQuestions() {
    try {
        const res = await fetch('/api/admin/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(adminQuestionsCache)
        });
        if (res.ok) {
            alert('✓ Прашањата се зачувани');
        }
    } catch (e) {
        alert('Грешка при зачување: ' + e.message);
    }
}

function addNewTierForm() {
    const name = prompt('Назнава на награда:');
    if (!name) return;

    const minStr = prompt('Минимален број поени:');
    const min = parseInt(minStr);
    if (!Number.isInteger(min)) {
        alert('Невалиден број');
        return;
    }

    const maxStr = prompt('Максимален број поени (оставај празно за без максимум):');
    const max = maxStr === '' ? null : parseInt(maxStr);

    if (maxStr !== '' && !Number.isInteger(max)) {
        alert('Невалиден број');
        return;
    }

    adminTiersCache.push({ min, max, name });
    adminTiersCache.sort((a, b) => a.min - b.min);
    renderTiersList();
}

function deleteTier(idx) {
    if (confirm('Избриши наградно ниво?')) {
        adminTiersCache.splice(idx, 1);
        renderTiersList();
    }
}

async function saveRules() {
    const pointsCorrect = parseInt(document.getElementById('points-correct').value);
    const pointsWrong = parseInt(document.getElementById('points-wrong').value);
    const scoreFloor = parseInt(document.getElementById('score-floor').value);
    const wrongMsg = document.getElementById('wrong-message').value;

    if (!Number.isInteger(pointsCorrect) || !Number.isInteger(pointsWrong) || !Number.isInteger(scoreFloor)) {
        alert('Невалидни поени');
        return;
    }

    const rulesData = {
        points: { correct: pointsCorrect, wrong: pointsWrong },
        score_floor: scoreFloor,
        wrong_answer_message: wrongMsg,
        tiers: adminTiersCache
    };

    try {
        const res = await fetch('/api/admin/quiz_rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rulesData)
        });
        if (res.ok) {
            alert('✓ Правилата се зачувани');
            await loadAdminRules();
        }
    } catch (e) {
        alert('Грешка при зачување: ' + e.message);
    }
}

async function exportData() {
    const btn = document.getElementById('export-btn');
    const status = document.getElementById('export-status');

    if (!btn || !status) return;

    btn.disabled = true;
    status.innerText = 'Се подготвува...';

    try {
        const res = await fetch('/api/admin/export', { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            status.innerText = `✓ ${data.rows} водители експортирани на Desktop`;
            setTimeout(() => { status.innerText = ''; }, 3000);
        } else {
            status.innerText = '✗ Грешка при експорт';
        }
    } catch (e) {
        status.innerText = '✗ Грешка: ' + e.message;
    } finally {
        btn.disabled = false;
    }
}

// ─── Camera Rotation Functions ────────────────────────────────────────────

async function loadAdminCameraSettings() {
    try {
        const res = await fetch('/api/admin/camera_settings');
        if (res.ok) {
            const data = await res.json();
            adminCameraRotation = data.camera_rotation || 0;
            adminCameraMirror = data.camera_mirror || false;
            updateRotationDisplay();
            updateMirrorDisplay();
            initCameraPreview();
        }
    } catch (e) {
        console.error('Failed to load camera settings:', e);
    }
}

async function initCameraPreview() {
    const videoEl = document.getElementById('admin-camera-preview');
    const errorEl = document.getElementById('admin-camera-error');
    
    if (!videoEl) return;

    // Stop existing stream if any
    if (adminCameraStream) {
        adminCameraStream.getTracks().forEach(track => track.stop());
        adminCameraStream = null;
    }

    try {
        adminCameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } }
        });
        videoEl.srcObject = adminCameraStream;
        errorEl.style.display = 'none';
        applyPreviewTransform();
    } catch (err) {
        console.error('Camera access failed:', err);
        videoEl.srcObject = null;
        errorEl.style.display = 'block';
    }
}

function applyPreviewTransform() {
    const videoEl = document.getElementById('admin-camera-preview');
    if (!videoEl) return;
    
    let transform = `rotate(${adminCameraRotation}deg)`;
    if (adminCameraRotation === 90 || adminCameraRotation === 270) {
        transform += ` scale(1.3334)`;
    }
    if (adminCameraMirror) {
        transform += ' scaleX(-1)';
    }
    videoEl.style.transform = transform;
}

function selectRotationAngle(angle) {
    adminCameraRotation = angle;
    updateRotationDisplay();
    applyPreviewTransform();
    
    // Highlight selected button
    document.querySelectorAll('.rotation-btn').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.angle) === angle) {
            btn.classList.add('active');
        }
    });
}

function updateRotationDisplay() {
    const display = document.getElementById('current-rotation-display');
    if (display) {
        display.innerText = adminCameraRotation;
    }
    
    // Update button highlight
    document.querySelectorAll('.rotation-btn').forEach(btn => {
        btn.classList.remove('active');
        if (parseInt(btn.dataset.angle) === adminCameraRotation) {
            btn.classList.add('active');
        }
    });
}

function toggleCameraMirror() {
    adminCameraMirror = !adminCameraMirror;
    updateMirrorDisplay();
    applyPreviewTransform();
}

function updateMirrorDisplay() {
    const flipBtn = document.getElementById('flip-btn');
    if (flipBtn) {
        flipBtn.classList.toggle('active', adminCameraMirror);
    }
}

async function saveCameraSettings() {
    const btn = document.getElementById('save-camera-settings-btn');
    if (!btn) return;

    btn.disabled = true;
    const originalText = btn.innerText;
    btn.innerText = 'Се зачувува...';

    try {
        const res = await fetch('/api/admin/camera_settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                camera_rotation: adminCameraRotation,
                camera_mirror: adminCameraMirror
            })
        });
        if (res.ok) {
            btn.innerText = '✓ Ротација зачувана!';
            setTimeout(() => {
                btn.innerText = originalText;
                btn.disabled = false;
            }, 2000);
        } else {
            btn.innerText = '✗ Грешка!';
            setTimeout(() => {
                btn.innerText = originalText;
                btn.disabled = false;
            }, 2000);
        }
    } catch (e) {
        console.error('Error saving camera settings:', e);
        btn.innerText = '✗ Грешка!';
        setTimeout(() => {
            btn.innerText = originalText;
            btn.disabled = false;
        }, 2000);
    }
}

// Cleanup camera stream when admin panel closes
function cleanupCameraStream() {
    if (adminCameraStream) {
        adminCameraStream.getTracks().forEach(track => track.stop());
        adminCameraStream = null;
    }
}

// Initialize admin panel when DOM is ready
document.addEventListener('DOMContentLoaded', initAdminPanel);
