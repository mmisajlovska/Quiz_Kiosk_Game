# Digital Photobooth Quiz — PyInstaller Packaging Guide

> **Purpose:** This document walks through every step required to package the Flask-based Digital Photobooth Quiz kiosk into a standalone Windows `.exe` using PyInstaller. It also includes a mandatory second-look analysis of the application with concrete improvement suggestions before packaging.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Preparation](#2-project-preparation)
3. [Second-Look Analysis — Review Before Packaging](#3-second-look-analysis--review-before-packaging)
4. [Installing PyInstaller](#4-installing-pyinstaller)
5. [Understanding the Spec File](#5-understanding-the-spec-file)
6. [Creating the `.spec` File](#6-creating-the-spec-file)
7. [Building the Executable](#7-building-the-executable)
8. [Post-Build: Required Files to Distribute](#8-post-build-required-files-to-distribute)
9. [Testing the Build](#9-testing-the-build)
10. [Common Errors and Fixes](#10-common-errors-and-fixes)
11. [Optional: Creating a Windows Installer with NSIS](#11-optional-creating-a-windows-installer-with-nsis)

---

## 1. Prerequisites

Before starting, ensure the following are in place on the **build machine** (must be Windows if targeting Windows):

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.10 or 3.11 | Match the version used during development |
| pip | Latest | Run `python -m pip install --upgrade pip` |
| Virtual environment | Recommended | Keeps the build clean and minimal |
| All `requirements.txt` packages | Installed | Must be importable in the active environment |
| Project root | Flat and complete | All files present: `main_flask.py`, `questions.json`, `quiz_rules.json`, `credentials.json`, `assets/`, `web/` |

> **Important:** Always build on the same OS as the target machine. A Windows `.exe` can only be produced on Windows. Do not build on macOS or Linux expecting a Windows executable.

---

## 2. Project Preparation

Before touching PyInstaller, the project directory must be clean and properly structured.

### 2.1 Confirm the folder layout

Your project root should look like this:

```
photobooth_quiz/
├── main_flask.py
├── export_data.py
├── questions.json
├── quiz_rules.json
├── brand.json              ← optional, create if missing
├── credentials.json        ← required for Google Drive
├── requirements.txt
├── assets/
│   └── dpb_logo.jpg
└── web/
    ├── index.html
    ├── app.js
    ├── style.css
    ├── qr.html
    └── qr.js
```

### 2.2 Set up a clean virtual environment

```bash
python -m venv venv
venv\Scripts\activate         # Windows
pip install -r requirements.txt
pip install pyinstaller
```

### 2.3 Verify `main_flask.py` can run without errors

```bash
python main_flask.py
```

The server must start and open the browser. If it fails here, it will fail in the bundle. Fix all errors before proceeding.

---

## 3. Second-Look Analysis — Review Before Packaging

> **This section is mandatory reading.** Before building the executable, the application was reviewed in full. The following issues and improvements were identified. Address them now — they are significantly harder to debug after packaging.

---

### 3.1 `BASE_DIR` breaks inside a PyInstaller bundle

**Problem:** `main_flask.py` uses `Path(__file__).parent` as `BASE_DIR`. Inside a PyInstaller one-file bundle, `__file__` points to a temporary extraction directory (`_MEIPASS`), not the actual executable location. This causes the app to fail to find `questions.json`, `credentials.json`, `leads.db`, and all assets.

**Fix:** Replace `BASE_DIR` at the top of `main_flask.py` with a runtime-safe resolver:

```python
import sys
from pathlib import Path

def get_base_dir() -> Path:
    """Return the directory of the executable (or script during dev)."""
    if getattr(sys, 'frozen', False):
        # Running inside a PyInstaller bundle
        return Path(sys.executable).parent
    return Path(__file__).parent

BASE_DIR = get_base_dir()
```

This ensures mutable runtime files (`leads.db`, `drive_token.json`, exported `.xlsx` files) are always written next to the `.exe`, not into a temp folder that is wiped on exit.

---

### 3.2 Bundled static assets (`web/`, `assets/`) need a separate data path

**Problem:** The `web/` folder and `assets/` folder are data files, not Python modules. PyInstaller must be explicitly told to include them. Even after inclusion, they land in `sys._MEIPASS` at runtime — a read-only temp directory. Flask's `send_from_directory` must point to `_MEIPASS` for these read-only static files, while `BASE_DIR` handles writable runtime files.

**Fix:** Add a second resolver for bundled read-only resources:

```python
def get_resource_dir() -> Path:
    """Return the directory where bundled read-only assets are located."""
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS)
    return Path(__file__).parent

RESOURCE_DIR = get_resource_dir()
```

Then update all references to `web/` and `assets/` to use `RESOURCE_DIR`, and keep `BASE_DIR` for database files, tokens, and JSON configs that need to be written at runtime.

---

### 3.3 `arial.ttf` font loading will silently fail on some machines

**Problem:** The image overlay code calls `ImageFont.truetype("arial.ttf", ...)` with just a filename. This relies on Arial being present in the system font path. On machines where it is not installed (e.g., stripped-down kiosk OS images), Pillow silently falls back to the ugly default bitmap font, ruining the branded photo output.

**Fix:** Bundle the font explicitly inside the `assets/` folder and load it by absolute path:

```python
FONT_PATH = RESOURCE_DIR / "assets" / "arial.ttf"

try:
    fnt_big   = ImageFont.truetype(str(FONT_PATH), int(h * 0.042))
    fnt_small = ImageFont.truetype(str(FONT_PATH), int(h * 0.026))
except Exception:
    fnt_big = fnt_small = ImageFont.load_default()
```

Copy `arial.ttf` (from `C:\Windows\Fonts\arial.ttf`) into your `assets/` folder before building.

---

### 3.4 Google Drive OAuth flow will hang in a frozen environment

**Problem:** `InstalledAppFlow.run_local_server(port=0)` opens a browser tab for OAuth. This works in a normal terminal session. Inside a packaged `.exe` without a console, it may fail silently or hang because the redirect callback server is blocked.

**Fix:** Run the OAuth flow **once manually** before distributing:

```bash
python main_flask.py   # triggers OAuth on first run
```

This generates `drive_token.json`. Include this pre-generated token file in the distribution folder alongside the `.exe`. The app will use the saved token and only attempt re-authentication when the token expires. Document this clearly for operators.

---

### 3.5 `launch_browser()` function is duplicated and fragile

**Problem:** The `launch_browser()` function contains identical code in both branches of its `try/except` block — both branches call `webbrowser.open(...)` identically. The `except` catches nothing different, so the fallback is meaningless.

**Fix:** Simplify it:

```python
def launch_browser():
    import webbrowser
    webbrowser.open("http://127.0.0.1:5000")
```

---

### 3.6 No graceful shutdown mechanism

**Problem:** In kiosk mode, the only way to stop the app is to kill the process or close the terminal. For a packaged `.exe`, there is no terminal. This can leave orphaned Flask processes on the machine.

**Fix:** Add a hidden admin shutdown endpoint, accessible only from localhost:

```python
@app.route('/api/admin/shutdown', methods=['POST'])
def shutdown():
    func = request.environ.get('werkzeug.server.shutdown')
    if func:
        func()
    return jsonify({"success": True})
```

Alternatively, set up a system tray icon using `pystray` that includes a "Quit" option — appropriate for a kiosk deployment.

---

### 3.7 `export_data.py` is a separate script and will not be inside the `.exe`

**Problem:** `export_data.py` is a standalone script invoked from the command line. After packaging, it will not be available unless bundled separately or its logic is fully absorbed into the Flask admin API (which already has `/api/admin/export`).

**Recommendation:** Remove `export_data.py` from distribution. Instruct operators to use the `/api/admin/export` endpoint via the browser, which already exports to the Desktop. If a standalone export tool is still needed, it must be compiled into its own separate `.exe`:

```bash
pyinstaller --onefile export_data.py
```

---

## 4. Installing PyInstaller

With the virtual environment active:

```bash
pip install pyinstaller
pyinstaller --version   # confirm it installed correctly
```

Use PyInstaller 6.x for best compatibility with Python 3.10/3.11.

---

## 5. Understanding the Spec File

PyInstaller uses a `.spec` file to control exactly what gets bundled. Rather than relying on auto-detection (which misses Flask templates, JSON files, and static assets), write the spec file manually.

Key sections in a `.spec` file:

| Section | Purpose |
|---|---|
| `Analysis` | Defines the entry script and tells PyInstaller what to collect |
| `datas` | Explicitly adds non-Python files (HTML, JS, CSS, JSON, images, fonts) |
| `hiddenimports` | Adds Python modules that PyInstaller cannot detect via static analysis |
| `EXE` | Configures the output executable (name, icon, console visibility) |
| `COLLECT` | Used for one-folder builds; omitted for one-file builds |

---

## 6. Creating the `.spec` File

Create a file named `photobooth.spec` in the project root with the following content.

> Read every comment carefully — each setting is specific to this application.

```python
# photobooth.spec
# Run with: pyinstaller photobooth.spec

import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

a = Analysis(
    ['main_flask.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        # Include the entire web/ folder (HTML, JS, CSS)
        ('web',          'web'),
        # Include all assets (logo, fonts)
        ('assets',       'assets'),
        # Include JSON config files
        ('questions.json',  '.'),
        ('quiz_rules.json', '.'),
        # Include brand config if it exists
        # ('brand.json',   '.'),   # uncomment if brand.json is present
        # Google Drive credentials — needed on first launch if no token yet
        # ('credentials.json', '.'),  # include only if distributing with credentials
    ],
    hiddenimports=[
        # Flask internals not always detected
        'flask',
        'flask.json.provider',
        'werkzeug',
        'werkzeug.serving',
        'werkzeug.routing',
        'werkzeug.exceptions',
        'werkzeug.middleware.shared_data',
        # Google API client hidden imports
        'google.auth',
        'google.auth.transport.requests',
        'google.oauth2.credentials',
        'google_auth_oauthlib.flow',
        'googleapiclient.discovery',
        'googleapiclient.http',
        # Image processing
        'PIL',
        'PIL.Image',
        'PIL.ImageDraw',
        'PIL.ImageFont',
        # QR code generation
        'qrcode',
        'qrcode.image.pure',
        'qrcode.image.styledpil',
        # Excel export
        'openpyxl',
        'openpyxl.styles',
        # Standard lib that may be missed
        'sqlite3',
        'threading',
        'io',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude test frameworks to reduce size
        'pytest',
        'unittest',
        'tkinter',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='DigitalPhotobooth',       # Output .exe name
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,                        # Compress with UPX if available
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,                   # Set True during debugging; False for kiosk
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets\\dpb_logo.ico',     # Optional: provide a .ico file for the taskbar icon
                                     # Convert dpb_logo.jpg to .ico first (see Section 9)
)
```

> **Console flag:** Set `console=True` during the first test build. This shows all Python output and errors in a terminal window. Once everything works, flip it to `False` for the final kiosk build.

---

## 7. Building the Executable

With the virtual environment active and the `.spec` file in place:

```bash
pyinstaller photobooth.spec
```

PyInstaller creates two folders:

```
build/    ← intermediate files, safe to delete
dist/
└── DigitalPhotobooth.exe   ← your final executable (one-file build)
```

The build process typically takes 1–3 minutes. Watch for `WARNING` lines in the output — they often indicate missing hidden imports that need to be added to the spec.

### Clean rebuild (if you make changes to the spec)

```bash
# Delete previous build artifacts first
rmdir /s /q build dist
pyinstaller photobooth.spec
```

---

## 8. Post-Build: Required Files to Distribute

The `.exe` is self-contained for Python code and bundled assets. However, several **runtime files must sit in the same folder** as the `.exe` when deployed:

```
deployment_folder/
├── DigitalPhotobooth.exe      ← from dist/
├── credentials.json           ← Google OAuth client credentials
├── drive_token.json           ← pre-generated OAuth token (see Section 3.4)
├── questions.json             ← (optional override — bundled copy used if absent)
├── quiz_rules.json            ← (optional override — bundled copy used if absent)
├── brand.json                 ← (optional branding override)
└── assets/
    └── dpb_logo.jpg           ← (optional override logo)
```

**Why are some JSON files listed as optional overrides?** Because they are bundled inside the `.exe` via the `datas` section. However, if you place a file with the same name in the same folder as the `.exe`, the `BASE_DIR` resolver (from Section 3.1) will find the external copy first — allowing you to update content without rebuilding the executable.

> **Security note:** Do not distribute `credentials.json` in a public or shared location. Treat it like a private API key.

---

## 9. Testing the Build

### Step 1 — First test with console enabled

Build with `console=True`. Double-click the `.exe`. A terminal window and browser should both open. Watch for:

- `ImportError` — means a hidden import is missing; add it to the spec
- `FileNotFoundError` — means a data file path is wrong; check `BASE_DIR` vs `RESOURCE_DIR` logic
- Flask startup errors — usually port conflicts or missing dependencies

### Step 2 — Test Google Drive flow

With `credentials.json` and no `drive_token.json` present, the OAuth browser popup should appear. Complete the sign-in. Verify `drive_token.json` is written next to the `.exe`.

### Step 3 — Test full quiz flow

Complete a full end-to-end session: registration → quiz → photo capture → preview → QR → verify the photo appears on Google Drive.

### Step 4 — Test export

Navigate to `/api/admin/export` or trigger the export via the admin UI. Verify the `.xlsx` file appears on the Desktop.

### Step 5 — Test on a clean machine

Copy the `deployment_folder/` to a machine that has **never had Python installed**. Run the `.exe`. If it works here, the build is complete.

### Optional — Convert logo to `.ico` for taskbar icon

```bash
pip install Pillow
python -c "
from PIL import Image
img = Image.open('assets/dpb_logo.jpg')
img.save('assets/dpb_logo.ico', format='ICO', sizes=[(16,16),(32,32),(48,48),(256,256)])
"
```

Then reference `assets\\dpb_logo.ico` in the `.spec` file's `icon=` field.

---

## 10. Common Errors and Fixes

| Error | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError: No module named 'flask'` | Flask not in hidden imports | Add `'flask'` to `hiddenimports` in the spec |
| `FileNotFoundError: questions.json` | `BASE_DIR` pointing to `_MEIPASS` for writable files | Apply the `get_base_dir()` fix from Section 3.1 |
| `FileNotFoundError: arial.ttf` | Font not on target machine | Bundle the font as described in Section 3.3 |
| `OSError: [WinError 10013]` | Port 5000 already in use | Kill the conflicting process; consider making the port configurable |
| `Failed to execute script main_flask` | Generic crash at startup | Rebuild with `console=True` to see the full traceback |
| Blank browser tab (no content) | `web/` folder not found in bundle | Verify the `datas` entry and the `RESOURCE_DIR` path logic |
| OAuth popup never appears | `run_local_server` blocked | Pre-generate `drive_token.json` before distributing (Section 3.4) |
| `.exe` is very large (>200MB) | UPX not installed or `excludes` too permissive | Install UPX (`winget install upx`); add unused packages to `excludes` |
| App works on build machine, fails on clean machine | Missing Visual C++ Runtime | Install [VC++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe) on target |

---

## 11. Optional: Creating a Windows Installer with NSIS

For a professional deployment, wrap the `deployment_folder/` into a one-click Windows installer using [NSIS (Nullsoft Scriptable Install System)](https://nsis.sourceforge.io/).

### Install NSIS

Download and install NSIS from `https://nsis.sourceforge.io/Download`.

### Basic installer script (`installer.nsi`)

```nsis
!define APP_NAME "Digital Photobooth Quiz"
!define EXE_NAME "DigitalPhotobooth.exe"
!define INSTALL_DIR "$PROGRAMFILES64\DigitalPhotoboothQuiz"

Name "${APP_NAME}"
OutFile "DigitalPhotobooth_Setup.exe"
InstallDir "${INSTALL_DIR}"
RequestExecutionLevel admin

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "deployment_folder\*.*"
  CreateShortcut "$DESKTOP\Digital Photobooth.lnk" "$INSTDIR\${EXE_NAME}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\*.*"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\Digital Photobooth.lnk"
SectionEnd
```

Compile with:

```bash
makensis installer.nsi
```

This produces `DigitalPhotobooth_Setup.exe` — a single file that installs the app, creates a Desktop shortcut, and registers an uninstaller.

---

*Guide written for Digital Photobooth Quiz v1.0 — Flask + Vanilla JS kiosk application.*
*Target platform: Windows 10 / 11 x64. Python 3.10 or 3.11. PyInstaller 6.x.*
