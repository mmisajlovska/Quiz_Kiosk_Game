import sys
import os
import json
import sqlite3
import csv
import datetime
from pathlib import Path
import base64
from io import BytesIO
import subprocess

from flask import Flask, send_from_directory, request, jsonify
from PIL import Image, ImageDraw, ImageFont
import qrcode
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment

# ── Config ─────────────────────────────────────────────────────────────────────
def get_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def get_resource_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", get_base_dir())).resolve()
    return get_base_dir()


def resolve_data_path(*parts: str) -> Path:
    runtime_path = BASE_DIR.joinpath(*parts)
    if runtime_path.exists():
        return runtime_path
    bundled_path = RESOURCE_DIR.joinpath(*parts)
    if bundled_path.exists():
        return bundled_path
    return runtime_path


BASE_DIR = get_base_dir()
RESOURCE_DIR = get_resource_dir()
DB_PATH = BASE_DIR / "leads.db"
QUESTIONS_FILE = BASE_DIR / "questions.json"
QUIZ_RULES_FILE = BASE_DIR / "quiz_rules.json"
BRAND_FILE = BASE_DIR / "brand.json"
LOGO_FILE = BASE_DIR / "assets" / "dpb_logo.jpg"
SCOPES = ["https://www.googleapis.com/auth/drive.file"]
CREDENTIALS_FILE = BASE_DIR / "credentials.json"
DRIVE_TOKEN_FILE = BASE_DIR / "drive_token.json"

DEFAULT_QUIZ_RULES = {
    "game_name": BASE_DIR.name,
    "points": {
        "correct": 50,
        "wrong": -20
    },
    "score_floor": 0,
    "camera_rotation": 0,
    "camera_mirror": False,
    "wrong_answer_message": "Грешен одговор, обиди се повторно",
    "tiers": [
        {"min": 0, "max": 100, "name": "Стикери"},
        {"min": 101, "max": 150, "name": "Магнет"},
        {"min": 151, "max": None, "name": "Брендирана торба"}
    ]
}

def load_json_file(*paths):
    for path in paths:
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
    return None

# ── DB ────────────────────────────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            surname       TEXT NOT NULL,
            phone         TEXT NOT NULL,
            email         TEXT,
            sms_consent   INTEGER NOT NULL,
            photo_path    TEXT,
            score         INTEGER DEFAULT 0,
            timestamp     TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

init_db()


def load_quiz_rules():
    rules = json.loads(json.dumps(DEFAULT_QUIZ_RULES))
    incoming = load_json_file(QUIZ_RULES_FILE, RESOURCE_DIR / "quiz_rules.json")
    if isinstance(incoming, dict):
        rules.update({k: v for k, v in incoming.items() if k in rules})

    points = rules.get("points", {})
    if not isinstance(points, dict):
        points = {}
    try:
        correct = int(points.get("correct", DEFAULT_QUIZ_RULES["points"]["correct"]))
    except Exception:
        correct = DEFAULT_QUIZ_RULES["points"]["correct"]
    try:
        wrong = int(points.get("wrong", DEFAULT_QUIZ_RULES["points"]["wrong"]))
    except Exception:
        wrong = DEFAULT_QUIZ_RULES["points"]["wrong"]
    try:
        score_floor = int(rules.get("score_floor", DEFAULT_QUIZ_RULES["score_floor"]))
    except Exception:
        score_floor = DEFAULT_QUIZ_RULES["score_floor"]

    wrong_message = rules.get("wrong_answer_message", DEFAULT_QUIZ_RULES["wrong_answer_message"])
    if not isinstance(wrong_message, str) or not wrong_message.strip():
        wrong_message = DEFAULT_QUIZ_RULES["wrong_answer_message"]

    game_name = rules.get("game_name", DEFAULT_QUIZ_RULES["game_name"])
    if not isinstance(game_name, str) or not game_name.strip():
        game_name = DEFAULT_QUIZ_RULES["game_name"]

    normalized_tiers = []
    tiers = rules.get("tiers", [])
    if isinstance(tiers, list):
        for tier in tiers:
            if not isinstance(tier, dict):
                continue
            try:
                tier_min = int(tier.get("min", 0))
            except Exception:
                continue

            tier_max_raw = tier.get("max")
            if tier_max_raw is None:
                tier_max = None
            else:
                try:
                    tier_max = int(tier_max_raw)
                except Exception:
                    continue

            name = tier.get("name")
            if not isinstance(name, str) or not name.strip():
                continue
            normalized_tiers.append({"min": tier_min, "max": tier_max, "name": name.strip()})

    if not normalized_tiers:
        normalized_tiers = DEFAULT_QUIZ_RULES["tiers"]

    # Normalize camera settings (rotation and mirror)
    try:
        cam_rotation = int(rules.get('camera_rotation', DEFAULT_QUIZ_RULES.get('camera_rotation', 0)))
    except Exception:
        cam_rotation = DEFAULT_QUIZ_RULES.get('camera_rotation', 0)
    if cam_rotation not in (0, 90, 180, 270):
        cam_rotation = DEFAULT_QUIZ_RULES.get('camera_rotation', 0)

    cam_mirror_raw = rules.get('camera_mirror', DEFAULT_QUIZ_RULES.get('camera_mirror', False))
    cam_mirror = bool(cam_mirror_raw)

    return {
        "game_name": game_name.strip(),
        "points": {
            "correct": correct,
            "wrong": wrong
        },
        "score_floor": score_floor,
        "wrong_answer_message": wrong_message,
        "tiers": normalized_tiers,
        "camera_rotation": cam_rotation,
        "camera_mirror": cam_mirror
    }


def load_brand():
    default_brand = {
        "company_name": "Digital Photobooth",
        "logo_file": "dpb_logo.jpg",
        "photo_overlay": {
            "bar_color": [232, 0, 110],
            "bar_opacity": 210,
            "line1_text": "digital PHOTOBOOTH",
            "line1_color": [255, 255, 255],
            "line2_text": "digitalphotobooth.mk",
            "line2_color": [255, 215, 0],
            "logo_position": "top-right"
        }
    }
    try:
        incoming = load_json_file(BRAND_FILE, RESOURCE_DIR / "brand.json")
        if isinstance(incoming, dict):
            # Simple update (doesn't do deep merge for nested dicts perfectly, but good enough for overlay fallback)
            default_brand.update(incoming)
    except Exception:
        pass
    return default_brand


def get_drive_service():
    credentials_path = resolve_data_path("credentials.json")
    if not credentials_path.exists():
        raise FileNotFoundError(f"Google Drive credentials not found: {CREDENTIALS_FILE}")

    creds = None
    if DRIVE_TOKEN_FILE.exists():
        try:
            with open(DRIVE_TOKEN_FILE, "r", encoding="utf-8") as f:
                token_data = json.load(f)
            creds = Credentials.from_authorized_user_info(token_data, SCOPES)
        except Exception:
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                creds = None

        if not creds:
            flow = InstalledAppFlow.from_client_secrets_file(str(credentials_path), SCOPES)
            creds = flow.run_local_server(port=0)

        with open(DRIVE_TOKEN_FILE, "w", encoding="utf-8") as f:
            f.write(creds.to_json())

    return build("drive", "v3", credentials=creds)


def ensure_drive_folder(service, folder_name):
    escaped_name = folder_name.replace("'", "\\'")
    query = (
        f"name = '{escaped_name}' and "
        "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )

    response = service.files().list(
        q=query,
        spaces="drive",
        fields="files(id,name)",
        pageSize=10
    ).execute()
    files = response.get("files", [])
    if files:
        return files[0].get("id")

    created = service.files().create(
        body={
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder"
        },
        fields="id"
    ).execute()
    return created.get("id")


def upload_file_to_drive(service, image_buffer, filename, mime_type="image/jpeg", parent_folder_id=None):
    file_metadata = {"name": filename}
    if parent_folder_id:
        file_metadata["parents"] = [parent_folder_id]
    image_buffer.seek(0)
    media = MediaIoBaseUpload(image_buffer, mimetype=mime_type, resumable=False)
    created = service.files().create(body=file_metadata, media_body=media, fields="id").execute()
    file_id = created.get("id")
    if file_id:
        try:
            service.permissions().create(
                fileId=file_id,
                body={"role": "reader", "type": "anyone"}
            ).execute()
        except Exception:
            pass
    return file_id


def generate_qr_data_url(text):
    qr_img = qrcode.make(text)
    buf = BytesIO()
    qr_img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode('utf-8')


current_lead = {}

app = Flask(__name__, static_folder=str(resolve_data_path("web")))

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/admin')
def serve_admin():
    return send_from_directory(app.static_folder, 'admin.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route('/assets/<path:path>')
def serve_assets(path):
    return send_from_directory(str(resolve_data_path("assets")), path)

@app.route('/api/questions', methods=['GET'])
def get_questions():
    questions = load_json_file(QUESTIONS_FILE, RESOURCE_DIR / "questions.json")
    if questions is not None:
        return jsonify(questions)
    return jsonify([])


@app.route('/api/quiz_rules', methods=['GET'])
def get_quiz_rules():
    return jsonify(load_quiz_rules())

@app.route('/api/brand', methods=['GET'])
def get_brand():
    return jsonify(load_brand())

@app.route('/api/set_lead', methods=['POST'])
def set_lead():
    global current_lead
    current_lead = request.json
    return jsonify({"success": True})

@app.route('/api/save_photo', methods=['POST'])
def save_photo():
    global current_lead
    try:
        rules = load_quiz_rules()
        brand = load_brand()
        data = request.json
        base64_data = data['image']
        try:
            final_score = int(data.get('score', 0))
        except Exception:
            final_score = 0
        final_score = max(int(rules.get('score_floor', 0)), final_score)

        header, encoded = base64_data.split(",", 1)
        img_data = base64.b64decode(encoded)
        img = Image.open(BytesIO(img_data)).convert("RGBA")

        # camera_rotation and camera_mirror are now fully handled by the frontend canvas
        # to ensure the taken picture exactly matches the CSS preview.
        # No server-side transformations needed.

        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

        # Apply overlay based on brand config
        w, h = img.size
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        
        overlay_cfg = brand.get("photo_overlay", {})
        bar_color = tuple(overlay_cfg.get("bar_color", [232, 0, 110]))
        bar_opacity = overlay_cfg.get("bar_opacity", 210)
        
        bar_h = int(h * 0.13)
        draw.rectangle([(0, h - bar_h), (w, h)], fill=(*bar_color, bar_opacity))
        
        try:
            fnt_big   = ImageFont.truetype("arial.ttf", int(h * 0.042))
            fnt_small = ImageFont.truetype("arial.ttf", int(h * 0.026))
        except Exception:
            font_path = resolve_data_path("assets", "arial.ttf")
            try:
                fnt_big = ImageFont.truetype(str(font_path), int(h * 0.042))
                fnt_small = ImageFont.truetype(str(font_path), int(h * 0.026))
            except Exception:
                fnt_big = fnt_small = ImageFont.load_default()
            
        l1_text = overlay_cfg.get("line1_text", "digital PHOTOBOOTH")
        l1_color = tuple(overlay_cfg.get("line1_color", [255, 255, 255]))
        l2_text = overlay_cfg.get("line2_text", "digitalphotobooth.mk")
        l2_color = tuple(overlay_cfg.get("line2_color", [255, 215, 0]))

        draw.text((w // 2, h - bar_h + bar_h // 3),
                  l1_text, font=fnt_big,
                  fill=(*l1_color, 255), anchor="mm")
        draw.text((w // 2, h - bar_h + int(bar_h * 0.72)),
                  l2_text, font=fnt_small,
                  fill=(*l2_color, 220), anchor="mm")
        
        logo_filename = brand.get("logo_file", "dpb_logo.jpg")
        logo_path = resolve_data_path("assets", logo_filename)
        
        if logo_path.exists():
            try:
                logo = Image.open(logo_path).convert("RGBA")
                logo_w = int(w * 0.18)
                logo_h = int(logo.height * logo_w / logo.width)
                logo = logo.resize((logo_w, logo_h), Image.LANCZOS)
                
                pos = overlay_cfg.get("logo_position", "top-right")
                if pos == "top-left":
                    img.paste(logo, (20, 20), logo)
                elif pos == "bottom-left":
                    img.paste(logo, (20, h - bar_h - logo_h - 20), logo)
                elif pos == "bottom-right":
                    img.paste(logo, (w - logo_w - 20, h - bar_h - logo_h - 20), logo)
                elif pos == "center":
                    img.paste(logo, ((w - logo_w) // 2, 20), logo)
                else: # top-right default
                    img.paste(logo, (w - logo_w - 20, 20), logo)
            except Exception:
                pass
                
        branded = Image.alpha_composite(img, overlay).convert("RGB")
        upload_buf = BytesIO()
        branded.save(upload_buf, "JPEG", quality=93)
        upload_buf.seek(0)

        preview_buf = BytesIO()
        branded.save(preview_buf, "JPEG", quality=85)
        preview_buf.seek(0)

        drive_link = None
        drive_qr = None
        try:
            service = get_drive_service()
            game_name = rules.get("game_name", DEFAULT_QUIZ_RULES["game_name"])
            folder_id = ensure_drive_folder(service, game_name)
            file_id = upload_file_to_drive(
                service,
                upload_buf,
                f"photo_{ts}_branded.jpg",
                parent_folder_id=folder_id
            )
            if file_id:
                drive_link = f"https://drive.google.com/file/d/{file_id}/view?usp=sharing"
                drive_qr = generate_qr_data_url(drive_link)
        except Exception as e:
            print("Drive upload / QR generation failed:", e)

        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO leads (name,surname,phone,email,sms_consent,photo_path,score,timestamp) VALUES (?,?,?,?,?,?,?,?)",
            (current_lead.get('name',''), current_lead.get('surname',''), current_lead.get('phone',''), 
               current_lead.get('email', ''), 1 if current_lead.get('sms') else 0, drive_link, final_score, datetime.datetime.now().isoformat())
        )
        conn.commit()
        conn.close()
        return jsonify({
            "success": True,
            "b64_image": base64.b64encode(preview_buf.read()).decode('utf-8'),
            "drive_qr": drive_qr,
            "drive_link": drive_link
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


# ── Admin API Endpoints ─────────────────────────────────────────────────────────

@app.route('/api/admin/questions', methods=['GET'])
def admin_get_questions():
    """Get all questions from questions.json"""
    questions = load_json_file(QUESTIONS_FILE, RESOURCE_DIR / "questions.json")
    if questions is not None:
        return jsonify(questions)
    return jsonify([])


@app.route('/api/admin/questions', methods=['POST'])
def admin_save_questions():
    """Save questions to questions.json"""
    try:
        questions = request.json
        if not isinstance(questions, list):
            return jsonify({"success": False, "error": "Invalid format"}), 400
        
        with open(QUESTIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(questions, f, ensure_ascii=False, indent=2)
        
        return jsonify({"success": True, "message": "Questions saved"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/admin/quiz_rules', methods=['GET'])
def admin_get_rules():
    """Get quiz rules from quiz_rules.json"""
    return jsonify(load_quiz_rules())


@app.route('/api/admin/quiz_rules', methods=['POST'])
def admin_save_rules():
    """Save quiz rules to quiz_rules.json"""
    try:
        rules = request.json
        if not isinstance(rules, dict):
            return jsonify({"success": False, "error": "Invalid format"}), 400
        
        with open(QUIZ_RULES_FILE, "w", encoding="utf-8") as f:
            json.dump(rules, f, ensure_ascii=False, indent=2)
        
        return jsonify({"success": True, "message": "Rules saved"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500




@app.route('/api/admin/camera_settings', methods=['GET'])
def admin_get_camera_settings():
    """Get camera rotation and mirror settings"""
    rules = load_quiz_rules()
    return jsonify({
        "camera_rotation": rules.get('camera_rotation', 0),
        "camera_mirror": rules.get('camera_mirror', False)
    })


@app.route('/api/admin/camera_settings', methods=['POST'])
def admin_save_camera_settings():
    """Save camera rotation and mirror settings"""
    try:
        data = request.json
        rotation = data.get('camera_rotation', 0)
        mirror = data.get('camera_mirror', False)
        
        # Validate rotation is 0, 90, 180, or 270
        if rotation not in [0, 90, 180, 270]:
            return jsonify({"success": False, "error": "Invalid rotation angle. Must be 0, 90, 180, or 270"}), 400
        
        rules = load_quiz_rules()
        rules['camera_rotation'] = rotation
        rules['camera_mirror'] = mirror
        
        with open(QUIZ_RULES_FILE, "w", encoding="utf-8") as f:
            json.dump(rules, f, ensure_ascii=False, indent=2)
        
        return jsonify({"success": True, "message": "Camera settings saved", "camera_rotation": rotation, "camera_mirror": mirror})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/admin/export', methods=['POST'])
def admin_export_data():
    """Export leads to Excel on Desktop"""
    try:
        if not DB_PATH.exists():
            return jsonify({"success": False, "error": "Database not found"}), 404
        
        # Get Desktop path
        desktop_path = Path.home() / "Desktop"
        if not desktop_path.exists():
            desktop_path = Path.home()
        
        # Create filename with timestamp
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        xlsx_filename = f"results_{timestamp}.xlsx"
        xlsx_path = desktop_path / xlsx_filename
        
        # Read from database
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT name, surname, phone, email, sms_consent, score, timestamp FROM leads ORDER BY timestamp DESC")
        rows = c.fetchall()
        conn.close()
        
        # Write Excel
        wb = Workbook()
        ws = wb.active
        ws.title = "Leads"
        
        headers = ["Name", "Surname", "Phone", "Email", "SMS Consent", "Score", "Timestamp"]
        ws.append(headers)
        
        # Format header row
        for cell in ws[1]:
            cell.font = Font(bold=True)
            cell.alignment = Alignment(horizontal='center')
        
        # Add data rows
        for row in rows:
            name, surname, phone, email, sms_consent, score, timestamp = row
            sms_text = "Yes" if sms_consent else "No"
            ws.append([name, surname, phone, email or '', sms_text, score, timestamp])
        
        # Set column widths
        ws.column_dimensions['A'].width = 15
        ws.column_dimensions['B'].width = 15
        ws.column_dimensions['C'].width = 15
        ws.column_dimensions['D'].width = 25
        ws.column_dimensions['E'].width = 12
        ws.column_dimensions['F'].width = 10
        ws.column_dimensions['G'].width = 20
        
        # Freeze header row
        ws.freeze_panes = 'A2'
        
        wb.save(xlsx_path)
        
        return jsonify({"success": True, "rows": len(rows), "file": str(xlsx_path)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


def launch_browser():
    import webbrowser
    webbrowser.open("http://127.0.0.1:5000")

if __name__ == '__main__':
    print("🚀 Starting Flask Web Engine...")
    import threading
    threading.Timer(1.2, launch_browser).start()
    app.run(host="0.0.0.0", port=5000, debug=False)
