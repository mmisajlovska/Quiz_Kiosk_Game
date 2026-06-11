# photobooth.spec
# Build a kiosk-friendly one-folder distribution:
#   pyinstaller --noconfirm --clean photobooth.spec

block_cipher = None
from pathlib import Path

PROJECT_ROOT = Path.cwd()

a = Analysis(
    ['main_flask.py'],
    pathex=[str(PROJECT_ROOT)],
    binaries=[],
    datas=[
        ('web', 'web'),
        ('assets', 'assets'),
        ('questions.json', '.'),
        ('quiz_rules.json', '.'),
        ('brand.json', '.'),
        ('credentials.json', '.'),
    ],
    hiddenimports=[
        'flask',
        'flask.json.provider',
        'werkzeug',
        'werkzeug.serving',
        'werkzeug.routing',
        'werkzeug.exceptions',
        'werkzeug.middleware.shared_data',
        'google.auth',
        'google.auth.transport.requests',
        'google.oauth2.credentials',
        'google_auth_oauthlib.flow',
        'googleapiclient.discovery',
        'googleapiclient.http',
        'PIL',
        'PIL.Image',
        'PIL.ImageDraw',
        'PIL.ImageFont',
        'qrcode',
        'qrcode.image.pure',
        'qrcode.image.styledpil',
        'openpyxl',
        'openpyxl.styles',
        'sqlite3',
        'threading',
        'io',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'pytest',
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
    [],
    exclude_binaries=True,
    name='DigitalPhotobooth',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='DigitalPhotobooth',
)