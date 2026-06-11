# Digital Photobooth Quiz

Interactive kiosk app built with Flask + vanilla JS.
Users register, play a quiz, take a branded photo, and download it through a QR code linked to Google Drive.

## What the app does

- Shows a multi-screen kiosk flow in one web app.
- Collects lead data (name, surname, phone, SMS consent).
- Runs a quiz loaded from JSON.
- Opens camera, captures a selfie, and creates a branded output image.
- Saves lead + photo metadata in SQLite.
- Uploads final image to Google Drive and generates a QR code for download.
- Uses a two-step result UX:
  - Preview page with the captured image.
  - QR page for phone download and restart.

## Project structure

- `main_flask.py`: Flask server, API endpoints, image processing, Google Drive upload.
- `web/index.html`: Main kiosk UI screens (splash, registration, rules, quiz, camera, preview).
- `web/app.js`: Frontend flow control, quiz logic, camera capture, upload call, page transitions.
- `web/qr.html`: Dedicated QR-only page.
- `web/qr.js`: Loads QR payload from session storage and handles restart.
- `web/style.css`: Styling and responsive layout.
- `questions.json`: Quiz content.
- `quiz_rules.json`: Editable scoring/reward logic (points, penalties, tier thresholds, messages).
- `credentials.json`: Google OAuth client credentials.
- `export_data.py`: Exports collected leads from SQLite to Excel.
- `requirements.txt`: Python dependencies.

## Flow: step by step

1. Splash screen
- User clicks Start.

2. Registration
- User enters name, surname, phone.
- User selects SMS consent.
- Frontend sends data to `POST /api/set_lead`.

3. Rules screen
- User reads rules and starts quiz.

4. Quiz
- Frontend fetches quiz from `GET /api/questions`.
- Frontend fetches scoring rules from `GET /api/quiz_rules`.
- User answers each question.
- Correct answer adds points, wrong attempts subtract points, and wrong penalties stack on repeated tries.
- Correct option is never revealed after wrong answer.
- After all questions, app opens the camera screen.

5. Camera and capture
- Browser requests camera access (`getUserMedia`).
- User starts countdown and captures photo.
- Frame is rendered to canvas, mirrored, encoded as base64 JPEG.

6. Server processing (`POST /api/save_photo`)
- Server decodes image.
- Applies branding overlay (bar/text/logo).
- Writes lead record into SQLite (`leads.db`).
- Tries upload to Google Drive.
- If upload succeeds, server returns a share link + QR image (base64 PNG).

7. Preview screen
- Frontend shows branded photo preview.
- If QR is available, enables the download button.
- User can tap Retry to retake the photo without re-entering registration data.

8. QR screen
- Frontend navigates to `web/qr.html`.
- QR payload is read from `sessionStorage`.
- User scans QR from phone.
- User clicks restart button to return to the beginning.

## Backend API

### `GET /`
Returns main kiosk page (`web/index.html`).

### `GET /<path>`
Serves static assets from `web/`.

### `GET /api/questions`
Returns quiz JSON from `questions.json`.

### `GET /api/quiz_rules`
Returns scoring and reward rules from `quiz_rules.json` (with safe defaults if file is missing/invalid).

### `POST /api/set_lead`
Stores current lead in memory for the current kiosk session.

Request example:
```json
{
  "name": "Ana",
  "surname": "Petrova",
  "phone": "+3897XXXXXXX",
  "email": "ana@example.com",
  "sms": true
}
```

### `POST /api/save_photo`
Accepts captured image data, processes image, stores DB row, uploads to Drive, returns preview and optional QR.

Request example:
```json
{
  "image": "data:image/jpeg;base64,...",
  "score": 170,
  "prize_name": "Брендирана торба"
}
```

Response example:
```json
{
  "success": true,
  "b64_image": "...",
  "drive_qr": "data:image/png;base64,...",
  "drive_link": "https://drive.google.com/file/d/.../view?usp=sharing"
}
```

## Data storage

- SQLite database file: `leads.db`
- Table: `leads`
  - id, name, surname, phone, email, sms_consent, photo_path, score, timestamp
- Photo links are stored in the database after upload to Google Drive.

## Scoring and rewards configuration

Edit `quiz_rules.json` to update scoring and prizes without changing application code.

Current defaults:
- Correct answer: `+50`
- Wrong answer attempt: `-20` (applies every wrong attempt on same question)
- Score floor: `0`
- Wrong-answer message: `Грешен одговор, обиди се повторно`

Tier defaults:
- `0-100`: `Стикери`
- `101-150`: `Магнет`
- `151+`: `Брендирана торба`

Example schema:
```json
{
  "points": {
    "correct": 50,
    "wrong": -20
  },
  "score_floor": 0,
  "wrong_answer_message": "Грешен одговор, обиди се повторно",
  "tiers": [
    { "min": 0, "max": 100, "name": "Стикери" },
    { "min": 101, "max": 150, "name": "Магнет" },
    { "min": 151, "max": null, "name": "Брендирана торба" }
  ]
}
```

## Google Drive integration

The app uses OAuth installed-app flow (`google-auth-oauthlib`) and stores token in `drive_token.json`.

Photos are uploaded into a dedicated Google Drive folder named by `game_name` in `quiz_rules.json`.
If that folder does not exist, the app creates it automatically.

Required file:
- `credentials.json` (Google OAuth client credentials)

Important:
- If OAuth config changes, delete `drive_token.json` and re-authenticate.
- For redirect errors (for example redirect_uri_mismatch), recreate OAuth client credentials in Google Cloud Console and download a fresh `credentials.json`.

## Setup

1. Create and activate virtual environment (optional but recommended).
2. Install dependencies:
```bash
pip install -r requirements.txt
```
3. Ensure these files/folders exist in project root:
- `credentials.json`
- `questions.json`
- `assets/logo.png` (optional, used if present)

## Run

From the project folder:
```bash
python main_flask.py
```

Server starts on:
- `http://127.0.0.1:5000`

On Windows, app tries to open Chrome in app mode automatically.

## Export leads

Run:
```bash
python export_data.py
```

Optional custom filename:
```bash
python export_data.py my_export.xlsx
```

Exports leads to Excel format (.xlsx) on the Desktop with columns: ID, Name, Surname, Phone, Email, SMS Consent, Score, and Timestamp.

## Troubleshooting

- Camera not available
  - Check browser camera permission.
  - Confirm no other app is locking the webcam.

- QR not shown
  - Drive upload likely failed.
  - Check terminal logs for "Drive upload / QR generation failed".

- OAuth sign-in fails
  - Verify `credentials.json` is valid for this app.
  - Remove `drive_token.json` and retry login.

- App starts but exits with error
  - Run from the project folder and inspect traceback in terminal.
  - Confirm all packages from `requirements.txt` are installed.
