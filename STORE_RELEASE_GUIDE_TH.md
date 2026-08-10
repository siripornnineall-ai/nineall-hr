# คู่มือเตรียมขึ้น Google Play และ App Store — Nineall HR

โปรเจกต์นี้ **เตรียมพร้อมสำหรับการส่ง Store** แล้ว (bundle identifier, ไอคอน
placeholder, ข้อความขอสิทธิ์ 2 ภาษา, plugin ที่จำเป็นถูกตั้งค่าไว้ใน `app.json`)
แต่ **ยังไม่ได้เผยแพร่จริง** — ต้องมีบัญชีนักพัฒนาและข้อมูลจริงจากเจ้าของระบบก่อน

## ข้อมูลที่ตั้งค่าไว้แล้ว

| รายการ | ค่า |
|---|---|
| ชื่อแอป | Nineall HR |
| Android Application ID | `com.nineall.hr` |
| iOS Bundle Identifier | `com.nineall.hr` |
| Scheme (Deep Link) | `nineallhr://` |
| สีหลักของแอป | `#af101a` |

## สิ่งที่ต้องเตรียมก่อนส่งจริง

### 1. บัญชีนักพัฒนา
- **Google Play Console**: สมัครบัญชี Developer (ค่าธรรมเนียมครั้งเดียว)
- **Apple Developer Program**: สมัครสมาชิกรายปี (ต้องมี macOS หรือใช้ EAS Build
  cloud build ก็ไม่ต้องมี Mac)

### 2. ไอคอนและภาพหน้าจอจริง
ไฟล์ placeholder อยู่ที่ `apps/employee-mobile/assets/` (icon.png,
android-icon-foreground.png ฯลฯ) — เปลี่ยนเป็นไฟล์จริงของบริษัทได้ทันที
ไม่ต้องแก้โค้ด

### 3. EAS Build (แนะนำ — ไม่ต้องมีเครื่อง Mac/PC สำหรับ build)
```bash
cd apps/employee-mobile
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview   # ทดสอบก่อน
eas build --platform ios --profile preview
```
ตั้งค่า EAS Build Profiles แยก Development / Preview (Internal Testing) /
Production ใน `eas.json` (สร้างไฟล์นี้ตอนรัน `eas build:configure` ครั้งแรก)

### 4. Google Play — Internal Testing ก่อนเผยแพร่จริง
1. สร้างแอปใหม่ใน Play Console
2. อัปโหลด build จาก EAS (.aab)
3. กรอก **Data Safety Checklist** — ต้องระบุว่าเก็บข้อมูล: ตำแหน่ง GPS
   (ใช้ตอนลงเวลาเท่านั้น), รูปภาพ (เซลฟียืนยันตัวตน), ข้อมูลส่วนบุคคล
   (ชื่อ เบอร์โทร เงินเดือน)
4. เพิ่มผู้ทดสอบใน Internal Testing track ก่อนปล่อยจริง

### 5. Apple — TestFlight ก่อนเผยแพร่จริง
1. สร้าง App ID `com.nineall.hr` ใน Apple Developer portal
2. อัปโหลด build จาก EAS ผ่าน `eas submit`
3. กรอก **App Privacy Checklist** ใน App Store Connect (หัวข้อเดียวกับ Data
   Safety ของ Google — ตำแหน่ง, รูปภาพ, ข้อมูลส่วนบุคคล, ข้อมูลการเงิน)
4. เพิ่มผู้ทดสอบใน TestFlight

### 6. Privacy Policy และ Terms of Service
ต้องมี URL จริงที่เข้าถึงได้สาธารณะก่อน submit ทั้งสอง Store — **ยังไม่มีในโปรเจกต์
นี้** ต้องให้ฝ่ายกฎหมายหรือเจ้าของบริษัทจัดทำ แล้วนำ URL มาใส่ในหน้า Store listing

### 7. Account Deletion Process (Google Play บังคับตั้งแต่ปี 2023)
ต้องมีช่องทางให้ผู้ใช้ขอลบบัญชีได้โดยไม่ต้องเปิดแอป — เช่น หน้าเว็บสั้น ๆ หรือ
อีเมลติดต่อฝ่ายบุคคล ที่ระบุไว้ในหน้า Privacy Policy (ยังไม่ได้จัดทำ)

### 8. Store Description (ร่าง)

**ภาษาไทย**: "Nineall HR แอปพนักงานสำหรับลงเวลาเข้า-ออกงานด้วย GPS และเซลฟี
ขอลา ขอ OT ดูสลิปเงินเดือน และรับประกาศจากบริษัท ใช้งานง่าย ปลอดภัย
เชื่อมต่อกับระบบ HR ของบริษัทแบบเรียลไทม์"

**English**: "Nineall HR is the employee companion app for GPS + selfie
clock-in/out, leave and overtime requests, payslips, and company
announcements — connected in real time to your company's HR system."

## Checklist ก่อนกด Submit

- [ ] เปลี่ยนไอคอน/Splash เป็นของจริง
- [ ] ตั้งค่า Supabase Production project (แยกจาก dev) ใน EAS secrets
- [ ] Privacy Policy + Terms of Service URL พร้อมใช้งาน
- [ ] Data Safety / App Privacy Checklist กรอกครบทั้งสอง Store
- [ ] Account Deletion ช่องทางพร้อมใช้งาน
- [ ] ทดสอบผ่าน Internal Testing (Google) / TestFlight (Apple) อย่างน้อย 1 รอบ
- [ ] Release Notes ฉบับแรกพร้อม (แนะนำ: "เปิดตัวระบบ Nineall HR เวอร์ชันแรก")
