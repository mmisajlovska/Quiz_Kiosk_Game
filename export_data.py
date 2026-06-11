"""
export_data.py – Export all quiz leads from SQLite to Excel.
Run:  python export_data.py
Optional: python export_data.py --output my_export.xlsx
"""

import sqlite3
import sys
import datetime
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment

DB_PATH  = Path(__file__).parent / "leads.db"
OUT_DEFAULT = Path(__file__).parent / f"results_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

def export(out_path: Path = OUT_DEFAULT):
    if not DB_PATH.exists():
        print(f"[ERROR] Database not found: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    cur.execute("SELECT id, name, surname, phone, email, sms_consent, score, timestamp FROM leads ORDER BY id")
    rows = cur.fetchall()
    conn.close()

    if not rows:
        print("[INFO] No leads found in the database.")
        return

    # Create Excel workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Leads"
    
    headers = ["ID", "Ime", "Prezime", "Telefon", "E-mail", "SMS Soglasnost", "Skor", "Vreme"]
    ws.append(headers)
    
    # Format header row
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal='center')
    
    # Add data rows
    for row in rows:
        id_val, name, surname, phone, email, sms_consent, score, timestamp = row
        sms_text = "Da" if sms_consent else "Ne"
        ws.append([id_val, name, surname, phone, email or '', sms_text, score, timestamp])
    
    # Set column widths
    ws.column_dimensions['A'].width = 8
    ws.column_dimensions['B'].width = 15
    ws.column_dimensions['C'].width = 15
    ws.column_dimensions['D'].width = 15
    ws.column_dimensions['E'].width = 25
    ws.column_dimensions['F'].width = 15
    ws.column_dimensions['G'].width = 10
    ws.column_dimensions['H'].width = 20
    
    # Freeze header row
    ws.freeze_panes = 'A2'
    
    wb.save(out_path)

    print(f"[OK] Exported {len(rows)} leads → {out_path}")

if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT_DEFAULT
    export(out)
