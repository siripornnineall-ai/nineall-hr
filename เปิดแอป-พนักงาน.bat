@echo off
chcp 65001 >nul
title Nineall HR - กำลังเปิดแอปพนักงาน
echo กำลังเปิดระบบ Nineall HR (แอปสำหรับพนักงาน)...
echo กรุณารอสักครู่ เบราว์เซอร์จะเปิดขึ้นเองอัตโนมัติ
echo.
cd /d "%~dp0apps\employee-pwa"
start "Nineall HR - Employee Server (อย่าปิดหน้าต่างนี้ระหว่างใช้งาน)" cmd /k npm run dev
timeout /t 8 /nobreak >nul
start "" http://localhost:3011
echo.
echo เปิดเรียบร้อยแล้ว! ถ้าเบราว์เซอร์ยังไม่ขึ้นหน้าเว็บ ให้รอสักครู่แล้วกด Refresh
echo เมื่อเลิกใช้งาน ให้ปิดหน้าต่างสีดำที่ชื่อ "Employee Server" ด้วย
echo หน้าต่างนี้ปิดได้เลย
pause
