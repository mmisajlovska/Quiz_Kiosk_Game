/**
 * Virtual Keyboard Module
 * English-only layout with letters, symbols, and one-time Shift
 */

class VirtualKeyboard {
    constructor() {
        this.keyboard = null;
        this.currentInput = null;
        this.currentView = 'letters';
        this.shiftNext = false;
        this.savedCaret = 0;

        this.layouts = {
            letters: {
                default: [
                    'q w e r t y u i o p',
                    'a s d f g h j k l',
                    'shift z x c v b n m backspace',
                    'sym space'
                ],
                shift: [
                    'Q W E R T Y U I O P',
                    'A S D F G H J K L',
                    'shift Z X C V B N M backspace',
                    'sym space'
                ]
            },
            symbols: {
                default: [
                    '1 2 3 4 5 6 7 8 9 0',
                    "! # $ % & ' * + - / =",
                    '? ^ _ { | } ~ ` backspace',
                    '. , ( ) : ; < > @ [ ]',
                    'abc space'
                ]
            },
            numeric: [
                '1 2 3',
                '4 5 6',
                '7 8 9',
                '. 0 backspace'
            ]
        };

        this.init();
    }

    init() {
        this.createKeyboardContainer();
        this.attachInputListeners();
    }

    createKeyboardContainer() {
        if (!document.getElementById('virtual-keyboard')) {
            const container = document.createElement('div');
            container.id = 'virtual-keyboard';
            container.className = 'keyboard-overlay hg-keyboard';
            container.style.display = 'none';

            const keepFocusOnInput = (event) => {
                if (event.target.closest('button')) {
                    event.preventDefault();
                }
            };

            container.addEventListener('pointerdown', keepFocusOnInput);
            container.addEventListener('mousedown', keepFocusOnInput);
            document.body.appendChild(container);
        }
    }

    attachInputListeners() {
        const attachToElement = (el) => {
            el.addEventListener('focus', (e) => {
                this.show(e.target);
            });

            el.addEventListener('blur', () => {
                setTimeout(() => {
                    if (document.activeElement === document.body ||
                        !document.activeElement?.matches('input, textarea')) {
                        this.hide();
                    }
                }, 50);
            });
        };

        document.querySelectorAll('input:not([type="hidden"]), textarea').forEach((el) => {
            attachToElement(el);
        });

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches('input:not([type="hidden"]), textarea')) {
                                attachToElement(node);
                            }
                            node.querySelectorAll('input:not([type="hidden"]), textarea').forEach((el) => {
                                attachToElement(el);
                            });
                        }
                    });
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    show(inputElement) {
        this.currentInput = inputElement;
        this.renderKeyboard(inputElement);
    }

    hide() {
        const container = document.getElementById('virtual-keyboard');
        if (container) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
        this.currentView = 'letters';
        this.shiftNext = false;
    }

    renderKeyboard(inputElement) {
        const container = document.getElementById('virtual-keyboard');
        if (!container) return;

        // Save current caret position before re-render
        if (this.currentInput) {
            this.savedCaret = this.currentInput.selectionStart || 0;
        }

        const layout = this.getLayoutForInput(inputElement);

        container.innerHTML = '';
        container.style.display = 'block';

        // Restore caret position after rendering
        setTimeout(() => {
            if (this.currentInput) {
                try {
                    this.currentInput.setSelectionRange(this.savedCaret, this.savedCaret);
                    this.currentInput.focus();
                } catch (e) {
                    // Silently ignore errors on types that don't support setSelectionRange
                }
            }
        }, 0);

        layout.forEach((row) => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'hg-row';

            row.split(' ').forEach((key) => {
                const btn = document.createElement('button');
                btn.className = 'hg-button';
                btn.type = 'button';

                if (key === 'shift') {
                    btn.className += ' hg-functionBtn';
                    btn.dataset.skbtn = 'shift';
                    btn.textContent = 'Shift';
                    if (this.shiftNext) {
                        btn.classList.add('active');
                    }
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.shiftNext = true;
                        this.currentView = 'letters';
                        this.renderKeyboard(inputElement);
                    });
                } else if (key === 'sym') {
                    btn.className += ' hg-functionBtn keyboard-mode-toggle';
                    btn.dataset.skbtn = 'symbols';
                    btn.textContent = '#+=';
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.currentView = 'symbols';
                        this.shiftNext = false;
                        this.renderKeyboard(inputElement);
                    });
                } else if (key === 'abc') {
                    btn.className += ' hg-functionBtn keyboard-mode-toggle';
                    btn.dataset.skbtn = 'letters';
                    btn.textContent = 'ABC';
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.currentView = 'letters';
                        this.renderKeyboard(inputElement);
                    });
                } else if (key === 'space') {
                    btn.className += ' hg-functionBtn';
                    btn.dataset.skbtn = 'space';
                    btn.textContent = ' ';
                    btn.style.flex = '3';
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.insertCharacter(' ');
                    });
                } else if (key === 'backspace') {
                    btn.className += ' hg-functionBtn';
                    btn.dataset.skbtn = 'backspace';
                    btn.innerHTML = '⌫';
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.backspace();
                    });
                } else {
                    btn.className += ' hg-standardBtn';
                    btn.textContent = key;
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.insertCharacter(key);
                        // Only re-render if shift was active (to deactivate it)
                        if (this.shiftNext) {
                            this.shiftNext = false;
                            this.currentView = 'letters';
                            this.renderKeyboard(inputElement);
                        }
                    });
                }

                rowDiv.appendChild(btn);
            });

            container.appendChild(rowDiv);
        });
    }

    getLayoutForInput(inputElement) {
        const inputType = inputElement.type || 'text';

        if (inputType === 'number' || inputType === 'tel') {
            return this.layouts.numeric;
        }

        if (this.currentView === 'symbols') {
            return this.layouts.symbols.default;
        }

        return this.layouts.letters[this.shiftNext ? 'shift' : 'default'];
    }

    insertCharacter(char) {
        if (!this.currentInput) return;

        const start = this.currentInput.selectionStart || 0;
        const end = this.currentInput.selectionEnd || 0;
        const value = this.currentInput.value;

        const newValue = value.substring(0, start) + char + value.substring(end);
        this.currentInput.value = newValue;

        try {
            this.currentInput.setSelectionRange(start + char.length, start + char.length);
        } catch (e) {
            // Silently ignore on input types that don't support setSelectionRange
        }

        this.currentInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    backspace() {
        if (!this.currentInput) return;

        const start = this.currentInput.selectionStart;
        const end = this.currentInput.selectionEnd;
        const value = this.currentInput.value;

        // Handle email and other inputs that may have null selection
        if (start === null || start === undefined) {
            if (value.length > 0) {
                const newValue = value.substring(0, value.length - 1);
                this.currentInput.value = newValue;
                try {
                    this.currentInput.setSelectionRange(newValue.length, newValue.length);
                } catch (e) {
                    // Silently ignore on unsupported input types
                }
            }
            this.currentInput.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }

        if (start === end && start > 0) {
            const newValue = value.substring(0, start - 1) + value.substring(end);
            this.currentInput.value = newValue;
            this.currentInput.selectionStart = this.currentInput.selectionEnd = start - 1;
        } else if (start !== end) {
            const newValue = value.substring(0, start) + value.substring(end);
            this.currentInput.value = newValue;
            this.currentInput.selectionStart = this.currentInput.selectionEnd = start;
        }

        this.currentInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.virtualKeyboard = new VirtualKeyboard();
    });
} else {
    window.virtualKeyboard = new VirtualKeyboard();
}
