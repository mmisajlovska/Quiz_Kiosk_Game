let brandConfig = null;

async function loadBrandConfig() {
    try {
        const res = await fetch('/api/brand');
        if (res.ok) {
            brandConfig = await res.json();
            applyBrandConfig(brandConfig);
        }
    } catch (e) {
        console.error('Failed to load brand config:', e);
    }
}

function applyBrandConfig(brand) {
    if (!brand) return;

    // Apply colors
    if (brand.colors) {
        const root = document.documentElement;
        if (brand.colors.primary) root.style.setProperty('--c-bg', brand.colors.primary);
        if (brand.colors.primary_dark) root.style.setProperty('--c-bg2', brand.colors.primary_dark);
        if (brand.colors.accent) root.style.setProperty('--c-accent', brand.colors.accent);
        if (brand.colors.card_bg) root.style.setProperty('--c-card', brand.colors.card_bg);
        if (brand.colors.text) root.style.setProperty('--c-text', brand.colors.text);
        if (brand.colors.text_muted) root.style.setProperty('--c-muted', brand.colors.text_muted);
        if (brand.colors.input_bg) root.style.setProperty('--c-input-bg', brand.colors.input_bg);
    }

    // Apply font and border radius
    if (brand.font) document.documentElement.style.setProperty('--font-main', `"${brand.font}", sans-serif`);
    if (brand.border_radius) document.documentElement.style.setProperty('--radius', brand.border_radius);

    // Apply logo
    if (brand.logo_file) {
        const logoUrls = [`/assets/${brand.logo_file}`];
        for (let i = 1; i <= 2; i++) {
            const logoEl = document.getElementById(`brand-logo-${i}`);
            if (logoEl) logoEl.src = logoUrls[0];
        }
    }

    // Apply UI text
    if (brand.ui_text) {
        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el && text) {
                if (id === 'ui-splash-title') {
                    el.innerHTML = text.replace(/\n/g, '<br>');
                } else {
                    el.innerText = text;
                }
            }
        };

        setText('ui-brand-bar', brand.ui_text.brand_bar);
        setText('ui-splash-title', brand.ui_text.splash_title);
        setText('ui-splash-subtitle', brand.ui_text.splash_subtitle);
        setText('ui-splash-cta', brand.ui_text.splash_cta);
        setText('ui-reg-title', brand.ui_text.reg_title);
        setText('ui-reg-subtitle', brand.ui_text.reg_subtitle);
        setText('ui-reg-cta', brand.ui_text.reg_cta);
        setText('ui-phone-prefix', brand.ui_text.phone_prefix);
        setText('ui-consent-label', brand.ui_text.consent_label);
        setText('ui-rules-title', brand.ui_text.rules_title);
        setText('ui-rules-cta', brand.ui_text.rules_cta);
        setText('ui-photo-title', brand.ui_text.photo_title);
        setText('ui-photo-subtitle', brand.ui_text.photo_subtitle);
        setText('ui-photo-cta', brand.ui_text.photo_cta);
        setText('ui-result-title', brand.ui_text.result_title);

        // Render Rules items
        if (brand.ui_text.rules_items && Array.isArray(brand.ui_text.rules_items)) {
            const rulesContainer = document.getElementById('rules-container');
            if (rulesContainer) {
                rulesContainer.innerHTML = '';
                brand.ui_text.rules_items.forEach((rule, idx) => {
                    if (idx > 0) {
                        const div = document.createElement('div');
                        div.className = 'divider';
                        rulesContainer.appendChild(div);
                    }
                    const item = document.createElement('div');
                    item.className = 'rule-item';
                    item.innerHTML = `<span class="emoji">${rule.emoji}</span> <p>${rule.text}</p>`;
                    rulesContainer.appendChild(item);
                });
            }
        }
    }

    // Toggle Registration Fields
    if (brand.registration_fields) {
        const toggleField = (id, show) => {
            const el = document.getElementById(id);
            if (el) el.style.display = show ? 'flex' : 'none';
        };
        toggleField('grp-name', brand.registration_fields.show_name);
        toggleField('grp-sur', brand.registration_fields.show_surname);
        toggleField('grp-phone', brand.registration_fields.show_phone);
        toggleField('grp-email', brand.registration_fields.show_email);

        const consentTiles = document.querySelector('.consent-tiles');
        const consentLbl = document.getElementById('ui-consent-label');
        if (consentTiles && consentLbl) {
            const showConsent = brand.registration_fields.show_sms_consent;
            consentTiles.style.display = showConsent ? 'flex' : 'none';
            consentLbl.style.display = showConsent ? 'block' : 'none';
        }
    }

    // Background style
    if (brand.background) {
        const bgEl = document.getElementById('bg-pattern');
        if (bgEl) {
            if (brand.background.style === 'image' && brand.background.image_url) {
                bgEl.style.backgroundImage = `url('/assets/${brand.background.image_url}')`;
                bgEl.style.backgroundSize = 'cover';
                bgEl.style.backgroundPosition = 'center';
                bgEl.style.opacity = brand.background.dot_opacity || 1;
            } else if (brand.background.style === 'solid' && brand.background.solid_color) {
                bgEl.style.backgroundImage = 'none';
                document.body.style.backgroundColor = brand.background.solid_color;
            } else {
                const dotSize = brand.background.dot_size || 30;
                bgEl.style.backgroundImage = `radial-gradient(var(--c-bg2) 15%, transparent 15%)`;
                bgEl.style.backgroundSize = `${dotSize}px ${dotSize}px`;
                bgEl.style.opacity = brand.background.dot_opacity || 0.8;
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', loadBrandConfig);

let currentQ = 0;
let questions = [];
let smsConsent = true;
let stream = null;
let isSavingPhoto = false;
let score = 0;
let currentPrize = '';
let cameraRotation = 0;
let cameraMirror = false;
const RESULT_STORAGE_KEY = 'photoboothResult';

const DEFAULT_QUIZ_RULES = {
    points: { correct: 50, wrong: -20 },
    score_floor: 0,
    wrong_answer_message: 'Грешен одговор, обиди се повторно',
    tiers: [
        { min: 0, max: 100, name: 'Стикери' },
        { min: 101, max: 150, name: 'Магнет' },
        { min: 151, max: null, name: 'Брендирана торба' }
    ]
};

let quizRules = normalizeQuizRules(DEFAULT_QUIZ_RULES);

function normalizeQuizRules(rawRules) {
    const rules = (rawRules && typeof rawRules === 'object') ? rawRules : {};
    const points = (rules.points && typeof rules.points === 'object') ? rules.points : {};

    const parsedCorrect = Number(points.correct);
    const parsedWrong = Number(points.wrong);
    const parsedFloor = Number(rules.score_floor);

    const normalized = {
        points: {
            correct: Number.isFinite(parsedCorrect) ? Math.trunc(parsedCorrect) : DEFAULT_QUIZ_RULES.points.correct,
            wrong: Number.isFinite(parsedWrong) ? Math.trunc(parsedWrong) : DEFAULT_QUIZ_RULES.points.wrong
        },
        score_floor: Number.isFinite(parsedFloor) ? Math.trunc(parsedFloor) : DEFAULT_QUIZ_RULES.score_floor,
        wrong_answer_message: (typeof rules.wrong_answer_message === 'string' && rules.wrong_answer_message.trim())
            ? rules.wrong_answer_message.trim()
            : DEFAULT_QUIZ_RULES.wrong_answer_message,
        tiers: []
    };

    if (Array.isArray(rules.tiers)) {
        normalized.tiers = rules.tiers
            .map(tier => {
                if (!tier || typeof tier !== 'object' || typeof tier.name !== 'string') {
                    return null;
                }

                const min = Number(tier.min);
                const max = tier.max === null ? null : Number(tier.max);
                if (!Number.isFinite(min)) {
                    return null;
                }
                if (tier.max !== null && !Number.isFinite(max)) {
                    return null;
                }

                return {
                    min: Math.trunc(min),
                    max: max === null ? null : Math.trunc(max),
                    name: tier.name.trim() || null
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.min - b.min);
    }

    if (!normalized.tiers.length) {
        normalized.tiers = [...DEFAULT_QUIZ_RULES.tiers];
    }

    return normalized;
}

async function loadQuizRules() {
    try {
        const res = await fetch('/api/quiz_rules');
        if (!res.ok) {
            throw new Error('Rules endpoint failed');
        }
        const data = await res.json();
        quizRules = normalizeQuizRules(data);
        cameraRotation = data.camera_rotation || 0;
        cameraMirror = data.camera_mirror || false;
    } catch (e) {
        quizRules = normalizeQuizRules(DEFAULT_QUIZ_RULES);
        cameraRotation = 0;
    }
}

function applyVideoTransform(videoElement) {
    if (!videoElement) return;
    let transform = `rotate(${cameraRotation}deg)`;
    if (cameraRotation === 90 || cameraRotation === 270) {
        transform += ` scale(1.3334)`;
    }
    if (cameraMirror) {
        transform += ' scaleX(-1)';
    }
    videoElement.style.transform = transform;
    videoElement.style.transformOrigin = 'center';
}

function updateScoreUI() {
    const scoreEl = document.getElementById('q-score');
    if (scoreEl) {
        scoreEl.innerText = `Поени: ${score}`;
    }
}

function getPrizeForScore(totalScore) {
    for (const tier of quizRules.tiers) {
        const inMin = totalScore >= tier.min;
        const inMax = tier.max === null ? true : totalScore <= tier.max;
        if (inMin && inMax) {
            return tier.name;
        }
    }
    const fallback = quizRules.tiers[quizRules.tiers.length - 1];
    return fallback ? fallback.name : 'Награда';
}

function nav(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function setConsent(val) {
    smsConsent = val;
    document.getElementById('tile-agree').classList.toggle('active', val);
    document.getElementById('tile-disagree').classList.toggle('active', !val);
}

async function submitReg() {
    const name = document.getElementById('inp-name').value.trim();
    const sur = document.getElementById('inp-sur').value.trim();
    const phone = document.getElementById('inp-phone').value.trim();
    const email = document.getElementById('inp-email')?.value.trim() || '';
    const err = document.getElementById('reg-err');

    let requiredFieldsMissing = false;
    if (brandConfig?.registration_fields?.show_name && !name) requiredFieldsMissing = true;
    if (brandConfig?.registration_fields?.show_surname && !sur) requiredFieldsMissing = true;
    if (brandConfig?.registration_fields?.show_phone && !phone) requiredFieldsMissing = true;
    if (brandConfig?.registration_fields?.show_email && !email) requiredFieldsMissing = true;

    if (requiredFieldsMissing) { err.innerText = "⚠ Пополни ги сите полиња!"; return; }
    if (brandConfig?.registration_fields?.show_phone && phone.length < 5) { err.innerText = "⚠ Внеси валиден телефонски број!"; return; }

    err.innerText = "";

    let fullPhone = brandConfig?.registration_fields?.show_phone ? (brandConfig.ui_text?.phone_prefix || "+389") + phone : "";

    await fetch('/api/set_lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, surname: sur, phone: fullPhone, email, sms: smsConsent })
    });

    nav('scr-rules');
}

async function startQuiz() {
    await loadQuizRules();

    try {
        let res = await fetch('/api/questions');
        questions = await res.json();
    } catch (e) {
        questions = [
            { question: "Што е фотобут?", options: [{ label: "A", text: "Машина" }], correct: "A" }
        ];
    }
    currentQ = 0;
    score = 0;
    currentPrize = '';
    updateScoreUI();
    renderQuestion();
    nav('scr-quiz');
}

function renderQuestion() {
    if (currentQ >= questions.length) {
        currentPrize = getPrizeForScore(score);
        startPhotobooth();
        return;
    }
    const q = questions[currentQ];
    document.getElementById('q-ind').innerText = `Прашање ${currentQ + 1} / ${questions.length}`;
    document.getElementById('q-prog').style.width = `${((currentQ) / questions.length) * 100}%`;
    document.getElementById('q-text').innerText = q.question;
    const fb = document.getElementById('q-feedback');
    fb.innerText = "";
    fb.classList.remove('show', 'is-correct', 'is-wrong');

    const opts = document.getElementById('q-options');
    opts.innerHTML = '';

    q.options.forEach(o => {
        const btn = document.createElement('button');
        btn.className = 'btn-opt';
        btn.innerText = `${o.label}.  ${o.text}`;
        btn.onclick = () => handleAnswer(btn, o.label, q.correct);
        opts.appendChild(btn);
    });
}

function handleAnswer(btn, chosen, correct) {
    const btns = document.querySelectorAll('.btn-opt');
    btns.forEach(b => b.disabled = true);

    const fb = document.getElementById('q-feedback');
    if (chosen === correct) {
        score = Math.max(quizRules.score_floor, score + quizRules.points.correct);
        updateScoreUI();

        btn.classList.add('correct');
        fb.innerText = "✔ Точно!";
        fb.classList.remove('is-wrong');
        fb.classList.add('show', 'is-correct');
        setTimeout(() => { currentQ++; renderQuestion(); }, 1200);
    } else {
        score = Math.max(quizRules.score_floor, score + quizRules.points.wrong);
        updateScoreUI();

        btn.classList.add('wrong');
        fb.innerText = quizRules.wrong_answer_message;
        fb.classList.remove('is-correct');
        fb.classList.add('show', 'is-wrong');
        setTimeout(() => { renderQuestion(); }, 1300);
    }
}

async function startPhotobooth() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }

    nav('scr-photo');
    document.getElementById('q-prog').style.width = `100%`;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } }
        });
        const vidElement = document.getElementById('vid-feed');
        vidElement.srcObject = stream;
        
        // Apply camera rotation and mirror if configured
        applyVideoTransform(vidElement);
        
        document.getElementById('btn-snap').disabled = false;
        document.getElementById('cam-countdown').innerText = '';
        document.getElementById('cam-overlay').className = 'cam-overlay';
    } catch (err) {
        console.error(err);
        document.getElementById('cam-countdown').innerText = "⚠ Без Камера";
    }
}

function startSnap() {
    if (isSavingPhoto) {
        return;
    }

    const vidElement = document.getElementById('vid-feed');
    applyVideoTransform(vidElement);
    
    const btn = document.getElementById('btn-snap');
    btn.disabled = true;
    let count = 3;
    const cd = document.getElementById('cam-countdown');
    const ov = document.getElementById('cam-overlay');
    ov.classList.add('counting');

    cd.innerText = count;

    const iv = setInterval(() => {
        count--;
        if (count > 0) {
            cd.innerText = count;
        } else {
            clearInterval(iv);
            cd.innerText = "";
            ov.classList.add('flash');
            setTimeout(() => { takePhoto(); }, 50);
        }
    }, 1000);
}

function takePhoto() {
    if (isSavingPhoto) {
        return;
    }

    const vid = document.getElementById('vid-feed');
    const canvas = document.getElementById('canvas-capture');
    const ctx = canvas.getContext('2d');

    const destWidth = canvas.width;
    const destHeight = canvas.height;

    ctx.clearRect(0, 0, destWidth, destHeight);
    ctx.save();
    
    // Move to center
    ctx.translate(destWidth / 2, destHeight / 2);
    
    // Apply CSS-matching rotation
    ctx.rotate((cameraRotation * Math.PI) / 180);
    
    // Apply horizontal scale if mirrored
    if (cameraMirror) {
        ctx.scale(-1, 1);
    }
    
    // Calculate dimensions to cover the canvas
    let targetW = destWidth;
    let targetH = destHeight;
    if (cameraRotation === 90 || cameraRotation === 270) {
        targetW = destHeight;
        targetH = destWidth;
    }
    
    const vidAspect = vid.videoWidth / vid.videoHeight;
    const targetAspect = targetW / targetH;
    
    let drawW = targetW;
    let drawH = targetH;
    
    if (vidAspect > targetAspect) {
        // Video is wider, fit height and crop width
        drawH = targetH;
        drawW = vid.videoWidth * (targetH / vid.videoHeight);
    } else {
        // Video is taller, fit width and crop height
        drawW = targetW;
        drawH = vid.videoHeight * (targetW / vid.videoWidth);
    }
    
    ctx.drawImage(vid, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    if (stream) {
        stream.getTracks().forEach(t => t.stop());
    }

    const b64 = canvas.toDataURL('image/jpeg', 0.92);
    isSavingPhoto = true;

    nav('scr-result');
    document.getElementById('res-status').innerText = "Се генерира Вашата фотографија...";
    resetResultImage();
    setResultLoading(true);
    document.getElementById('btn-open-qr').disabled = true;
    document.getElementById('btn-retry').disabled = true;
    clearResultData();

    fetch('/api/save_photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64, score: score, prize_name: currentPrize })
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                const previewImage = "data:image/jpeg;base64," + data.b64_image;
                loadResultImage(previewImage).then(() => setResultLoading(false));

                if (data.drive_qr) {
                    saveResultData({
                        b64_image: data.b64_image,
                        drive_qr: data.drive_qr,
                        drive_link: data.drive_link || null,
                        score: score,
                        prize_name: currentPrize
                    });
                    document.getElementById('res-status').innerText = "Фотографијата е подготвена. Притисни за преземање.";
                    document.getElementById('btn-open-qr').disabled = false;
                } else {
                    document.getElementById('res-status').innerText = "Фотографијата е зачувана, но QR кодот не е достапен.";
                    document.getElementById('btn-open-qr').disabled = true;
                }
            } else {
                setResultLoading(false);
                document.getElementById('res-status').innerText = "Грешка при зачувување.";
                document.getElementById('btn-open-qr').disabled = true;
            }
        })
        .catch(() => {
            loadResultImage(b64).then(() => setResultLoading(false));
            document.getElementById('res-status').innerText = "Грешка при прикачување. Обиди се повторно.";
            document.getElementById('btn-open-qr').disabled = true;
        })
        .finally(() => {
            isSavingPhoto = false;
            document.getElementById('btn-retry').disabled = false;
        });
}

function resetResultImage() {
    const img = document.getElementById('res-img');
    if (!img) {
        return;
    }

    img.onload = null;
    img.onerror = null;
    img.removeAttribute('src');
}

function loadResultImage(src) {
    const img = document.getElementById('res-img');
    if (!img) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        img.onload = () => {
            img.onload = null;
            img.onerror = null;
            resolve();
        };
        img.onerror = () => {
            img.onload = null;
            img.onerror = null;
            resolve();
        };
        img.src = src;
    });
}

function setResultLoading(isLoading) {
    const loader = document.getElementById('res-loader');
    const img = document.getElementById('res-img');
    if (!loader || !img) {
        return;
    }

    loader.classList.toggle('show', isLoading);
    img.style.visibility = isLoading ? 'hidden' : 'visible';
}

function saveResultData(payload) {
    sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(payload));
}

function clearResultData() {
    sessionStorage.removeItem(RESULT_STORAGE_KEY);
}

function openQrPage() {
    const stored = sessionStorage.getItem(RESULT_STORAGE_KEY);
    if (!stored) {
        document.getElementById('res-status').innerText = "QR кодот не е подготвен. Обиди се повторно.";
        return;
    }
    window.location.href = '/qr.html';
}

function retryPhoto() {
    if (isSavingPhoto) {
        return;
    }

    clearResultData();
    setResultLoading(false);
    document.getElementById('res-status').innerText = "Подготвување камера...";
    resetResultImage();
    document.getElementById('btn-open-qr').disabled = true;
    startPhotobooth();
}

function restartKiosk() {
    clearResultData();
    score = 0;
    currentPrize = '';
    updateScoreUI();
    document.getElementById('inp-name').value = '';
    document.getElementById('inp-sur').value = '';
    document.getElementById('inp-phone').value = '';
    setConsent(true);
    document.getElementById('reg-err').innerText = '';
    nav('scr-splash');
}

// Admin button navigation (splash screen only)
document.addEventListener('DOMContentLoaded', () => {
    const adminBtnSplash = document.getElementById('admin-btn-splash');
    if (adminBtnSplash) {
        adminBtnSplash.addEventListener('click', () => {
            window.location.href = '/admin';
        });
    }
});
