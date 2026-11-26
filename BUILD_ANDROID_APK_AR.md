# دليل بناء نسخة Android المستقلة (APK) لتطبيق Gassar.AI

تم تجهيز مشروع **Android Gradle المستقل** عبر **Capacitor** داخل المجلد `/android` (معرّف الحزمة: `com.gassar.ai`) ومزامنته مع مخرجات الواجهة الأمامية `dist/client`.

> **ملاحظة مهمة حول بيئة التشغيل الحالية**: حاوية السحابة هنا تعتمد على Linux/Node.js ولا تحتوي على Java JDK أو Android SDK أو Gradle، لذلك لا يمكن ترجمة ملف `.apk` التنفيذي النهائي داخل الحاوية نفسها. يمكنك بناؤه خلال دقائق على جهازك عبر الخطوات التالية.

---

## المتطلبات على جهازك
1. **Node.js 20+**
2. **Android Studio** (يتضمن Android SDK وJDK 17 وGradle) أو **Android Command-Line Tools**

---

## خطوات بناء ملف APK

1. افتح مجلد المشروع بعد تنزيله، ثم شغّل مزامنة Capacitor بعد أي تعديل على الواجهة:
   ```bash
   npm install
   npm run android:sync
   ```
   *(يقوم الأمر بتشغيل `vite build && cap sync android` لتحديث `android/app/src/main/assets/public`).*

2. افتح المشروع في Android Studio أو شغّل Gradle مباشرة:
   - **من سطر الأوامر (APK للتجربة Debug)**:
     ```bash
     cd android
     ./gradlew assembleDebug
     ```
     سيُحفظ الملف في:
     `android/app/build/outputs/apk/debug/app-debug.apk`

   - **من Android Studio**:
     - افتح المجلد `android/`
     - اختر من القائمة: **Build > Build Bundle(s) / APK(s) > Build APK(s)**

---

## ربط نسخة APK بالخادم الخلفي (Backend API)
لأن نسخة Android المستقلة تعمل داخل حاوية تطبيق أصلية (`https://localhost`)، تحتاج طلبات الذكاء الاصطناعي والبحث واستخراج PDF/DOCX إلى الاتصال بخادم Gassar.AI المنشور:

1. أنشر الخادم (`npm run build && npm run start`) على استضافة HTTPS (مثل Cloud Run أو VPS أو Railway) مع ضبط `GEMINI_API_KEY` وبقية مفاتيح البيئة على الخادم.
2. داخل تطبيق Android (أو قبل البناء عبر متغير البيئة `VITE_API_BASE_URL=https://your-server.example.com`):
   - افتح **الإعدادات (Settings)** -> قسم **عنوان الخادم للتطبيق المستقل (APK)**
   - أدخل رابط الخادم واحفظه.

---

## الفرق بين النسختين
| الميزة | نسخة الويب التقديمي (PWA) | نسخة Android المستقلة (`/android`) |
| --- | --- | --- |
| التشغيل الفوري | متاح ومباشر الآن على المنفذ `3000` | مشروع Capacitor Gradle جاهز للبناء إلى APK |
| التثبيت | تثبيت مباشر من المتصفح (Service Worker + Offline Shell) | تثبيت عبر ملف `.apk` على الهاتف |
| تخزين المحادثات | IndexedDB (`gassar_ai_db`) | IndexedDB داخل Android WebView |
| محرك GGUF المحلي | فحص ترويسة GGUF فقط (قيود المتصفح) | يتطلب ربط Capacitor Native Plugin بـ `llama.cpp` لتشغيل GGUF دون إنترنت |
