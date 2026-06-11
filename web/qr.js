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

    if (brand.font) document.documentElement.style.setProperty('--font-main', `"${brand.font}", sans-serif`);
    if (brand.border_radius) document.documentElement.style.setProperty('--radius', brand.border_radius);

    if (brand.logo_file) {
        const logoUrls = [`/assets/${brand.logo_file}`];
        for (let i = 1; i <= 3; i++) {
            const logoEl = document.getElementById(`brand-logo-${i}`);
            if (logoEl) logoEl.src = logoUrls[0];
        }
    }

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
        setText('ui-qr-title', brand.ui_text.qr_title);
        setText('ui-qr-subtitle', brand.ui_text.qr_subtitle);
        setText('ui-restart-cta', brand.ui_text.restart_cta);
    }

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

const RESULT_STORAGE_KEY = 'photoboothResult';

function loadQrData() {
    const raw = sessionStorage.getItem(RESULT_STORAGE_KEY);
    const statusEl = document.getElementById('qr-status');
    const qrImg = document.getElementById('qr-img');
    const prizeMsgEl = document.getElementById('qr-prize-msg');

    prizeMsgEl.hidden = true;
    prizeMsgEl.innerText = '';

    if (!raw) {
        statusEl.innerText = "Нема достапна слика за преземање. Врати се на почеток.";
        qrImg.hidden = true;
        return;
    }

    try {
        const data = JSON.parse(raw);

        if (data.drive_qr) {
            qrImg.src = data.drive_qr;
            qrImg.hidden = false;
            statusEl.innerText = "Скенирај го QR кодот за да ја преземеш фотографијата на твојот телефон.";

            const parsedScore = Number(data.score);
            const hasScore = Number.isFinite(parsedScore);
            const hasPrize = typeof data.prize_name === 'string' && data.prize_name.trim().length > 0;
            if (hasScore && hasPrize) {
                prizeMsgEl.innerText = `Честитки! Освои ${Math.trunc(parsedScore)} поени и добиваш ${data.prize_name.trim()}!`;
                prizeMsgEl.hidden = false;
            }

            // Trigger 4s confetti when successful
            playConfetti();
        } else {
            qrImg.hidden = true;
            statusEl.innerText = "QR кодот не е достапен. Врати се на почеток.";
        }
    } catch (e) {
        sessionStorage.removeItem(RESULT_STORAGE_KEY);
        qrImg.hidden = true;
        prizeMsgEl.hidden = true;
        statusEl.innerText = "Грешка со податоците за преземање. Врати се на почеток.";
    }
}

function restartFromQr() {
    sessionStorage.removeItem(RESULT_STORAGE_KEY);
    window.location.href = '/';
}

function playConfetti() {
    if (typeof confetti !== 'function') return;

    const duration = 4000;
    const end = Date.now() + duration;

    (function frame() {
        // use brand colors if available, otherwise fallback
        const c1 = brandConfig?.colors?.primary || '#ff3da0';
        const c2 = brandConfig?.colors?.accent || '#ffd700';
        const c3 = brandConfig?.colors?.card_bg || '#ffffff';
        const c4 = brandConfig?.colors?.primary_dark || '#e8006e';
        const colors = [c1, c2, c3, c4];

        confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.8 },
            colors: colors,
            scalar: 1.6
        });
        confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.8 },
            colors: colors,
            scalar: 1.6
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}

loadQrData();
