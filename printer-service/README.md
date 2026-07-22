# LECHAIM Print Service

שירות הדפסה מקומי למסעדה. רץ על מחשב המסעדה ומקבל בקשות הדפסה דרך HTTP.

**שלב 6:** קבלה + הדפסה לקונסול (בלי TCP).  
**שלב 9.0:** תור הדפסה (Queue) — משימה אחת בכל רגע לכל מדפסת.  
**שלב 9.1:** TCP אמיתי למדפסות (raw 9100 + ESC/POS cut).

---

## זרימה

```text
Website
   ↓
Printer Service  (POST /print)
   ↓
Queue            (FIFO per printer)
   ↓
Printer          (printer.js)
```

האתר לא מחכה לסיום ההדפסה הפיזית — מקבל `{ success: true }` ברגע שהמשימה נכנסה לתור.

Kitchen ו־Bar הם תורים נפרדים (מדפסות שונות יכולות לעבוד במקביל).  
בתוך אותה מדפסת — תמיד אחת אחרי השנייה.

---

## התקנה

מתוך תיקיית השירות:

```bash
cd printer-service
npm install
```

דרישה: **Node.js 18+**

---

## הרצה

```bash
npm start
```

השרת יעלה על:

```text
http://localhost:3001
```

---

## API

### `POST /print`

Body (JSON):

```json
{
  "printer": "kitchen",
  "ticket": "ORDER #1\nSteak x1\n"
}
```

תשובה (המשימה בתור):

```json
{
  "success": true,
  "queued": true,
  "jobId": "job_…",
  "position": 1,
  "printer": "kitchen"
}
```

### `GET /queue`

סטטוס התורים (כמה ממתינים / רצה כרגע).

### `GET /`

בדיקת חיים + תצוגת תור.

---

## בדיקה

עם השרת רץ:

**PowerShell — כמה הזמנות ברצף:**

```powershell
1..3 | ForEach-Object {
  Invoke-RestMethod -Uri http://localhost:3001/print -Method POST -ContentType "application/json" -Body (@{ printer = "kitchen"; ticket = "TEST $_" } | ConvertTo-Json)
}
Invoke-RestMethod -Uri http://localhost:3001/queue
```

בקונסול של `npm start` תראו `enqueued` ואז `printing` / `done` אחד אחרי השני.

---

## הגדרת מדפסות

`config.json`:

```json
{
  "printers": {
    "kitchen": { "ip": "192.168.1.181", "port": 9100 },
    "bar": { "ip": "192.168.1.180", "port": 9100 }
  }
}
```

כרגע `printer.js` מתחבר ב־TCP לפי `config.json` ושולח את הבון + חיתוך ESC/POS.

---

## מה לא כלול

- שינוי באתר / Print Engine / Admin / Queue API
