# 📋 แบบสำรวจความพึงพอใจ — คณะสหเวชศาสตร์ มหาวิทยาลัยนเรศวร

## ✅ ขั้นตอนการติดตั้งและใช้งาน (ครั้งแรกเท่านั้น)

### 1. ติดตั้ง Node.js
- ดาวน์โหลดจาก https://nodejs.org (เลือก LTS version)
- เปิดไฟล์ที่โหลดมา → กด Next จนเสร็จ
- เช็คว่าติดตั้งสำเร็จ: เปิด Terminal แล้วพิมพ์
  ```
  node --version
  ```
  ถ้าขึ้นเลข version เช่น `v20.x.x` = สำเร็จ

### 2. ติดตั้ง Dependencies
- เปิด **Terminal**
- พิมพ์คำสั่ง (เปลี่ยน path ตามที่เก็บโฟลเดอร์):
  ```
  cd ~/Desktop/survey-app
  npm install
  ```
- รอจนติดตั้งเสร็จ (ครั้งแรกครั้งเดียว ครั้งต่อไปไม่ต้องทำอีก)

---

## 🟢 เปิดเซิร์ฟเวอร์ (เริ่มใช้งาน)

เปิด **Terminal** แล้วพิมพ์:
```
cd ~/Desktop/survey-app
node server.js
```

จะขึ้นข้อความ:
```
🏥 AHS Survey Server is running!
   URL: http://localhost:3000
```

แล้วเปิดเบราว์เซอร์ไปที่ **http://localhost:3000**

### หน้าต่างๆ:
| หน้า | URL |
|------|-----|
| 🏠 หน้าหลัก | http://localhost:3000 |
| 📋 แบบสำรวจ (ฟิตเนส) | http://localhost:3000/survey.html?type=fitness |
| 📋 แบบสำรวจ (ธาราบำบัด) | http://localhost:3000/survey.html?type=hydro |
| 📋 แบบสำรวจ (กายภาพบำบัด) | http://localhost:3000/survey.html?type=pt |
| 📊 แดชบอร์ด (รหัส: admin2024) | http://localhost:3000/dashboard.html |

---

## 🔴 ปิดเซิร์ฟเวอร์ (หยุดใช้งาน)

ที่หน้าต่าง Terminal ที่เปิด server อยู่ → กด:
```
Ctrl + C
```
เซิร์ฟเวอร์จะหยุดทำงาน เว็บจะเข้าไม่ได้จนกว่าจะเปิดใหม่

---

## 📁 โครงสร้างไฟล์
```
survey-app/
├── server.js              ← เซิร์ฟเวอร์หลัก
├── package.json           ← รายการ dependencies
├── data/
│   └── survey.db          ← ฐานข้อมูล (สร้างอัตโนมัติ)
├── public/
│   ├── index.html         ← หน้าหลัก
│   ├── survey.html        ← แบบสำรวจ
│   ├── dashboard.html     ← แดชบอร์ด
│   ├── images/
│   │   └── logo.png       ← ← ใส่ไฟล์โลโก้ที่นี่
│   ├── css/
│   │   ├── index.css
│   │   ├── survey.css
│   │   └── dashboard.css
│   └── js/
│       ├── index.js
│       ├── survey.js
│       └── dashboard.js
```

## 🔑 รหัสผ่านแดชบอร์ด
```
admin2024
```

## ⚠️ หมายเหตุ
- ข้อมูลแบบสำรวจเก็บในไฟล์ `data/survey.db` ห้ามลบ!
- ถ้าต้องการรีเซ็ตข้อมูลทั้งหมด → ลบไฟล์ `data/survey.db` แล้วเปิดเซิร์ฟเวอร์ใหม่
- เปลี่ยนโลโก้ → วางไฟล์รูปชื่อ `logo.png` ในโฟลเดอร์ `public/images/`
