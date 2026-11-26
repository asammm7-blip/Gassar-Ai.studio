# تحليل فشل بناء Android — Gassar.AI

تاريخ التحديث: 16 نوفمبر 2026

## السبب الجذري المثبت

فشل البناء المحلي قبل تجميع Kotlin/Java بسبب عدم وجود Android SDK صالح في بيئة البناء:

```text
SDK location not found. Define a valid SDK location with an ANDROID_HOME environment variable
or by setting the sdk.dir path in android/local.properties.
```

لا يظهر في السجل الحالي خطأ من `gassar-device-telemetry` أو `llama.rn` أو TypeScript؛ Gradle يصل إلى تهيئة root project ثم يتوقف عند تحديد مسار SDK.

## ما تم إصلاحه داخل المشروع

- نقل `gassar-device-telemetry` من `modules/` إلى `packages/` لمنع اكتشاف الوحدة الأصلية مرتين.
- توحيد نسخة `expo-constants` وتحقق `expo-modules-autolinking` بنجاح.
- تقييد بنية GGUF الإنتاجية إلى `arm64-v8a`، لأن `llama.rn` والنماذج المحلية الكبيرة ليست هدفاً عملياً لـ 32-bit.
- خدمة Android الأمامية تعلن `FOREGROUND_SERVICE` و`FOREGROUND_SERVICE_SPECIAL_USE`، وتنشئ قناة إشعار ثابتة، وتدعم أزرار الإيقاف المؤقت/الاستئناف/الإيقاف والنافذة العائمة الاختيارية.
- إضافة انتظار تأكيد من الخدمة الأصلية قبل إعلان الخادم Running، بدلاً من إعلان نجاح التشغيل قبل وصول ACK.
- نجاح `expo config --json` و`expo-modules-autolinking verify` في النسخة الحالية.

## نتائج الفحوص الحالية

- `pnpm check`: ناجح.
- `pnpm test`: 154 اختباراً ناجحاً.
- `pnpm test:sync`: 40 اختباراً ناجحاً.
- `pnpm lint`: ناجح.
- `pnpm exec expo export --platform web`: ناجح.
- `expo-modules-autolinking verify`: ناجح.
- `android/gradlew :app:assembleDebug`: متوقف بسبب SDK location قبل compilation.

## ملاحظة Hermes على بيئة ARM64

بيئة التنفيذ الحالية ARM64 بينما مترجم Hermes الموجود في بعض حزم Node قد يكون x86-64. لذلك قد يفشل تصدير Android الذي يحاول توليد bytecode في هذه البيئة. خيار `--no-bytecode` يختبر حزمة JavaScript فقط، ولا يثبت نجاح APK. لا ينبغي تعطيل Hermes في إنتاج Android لمجرد نجاح التشخيص المحلي.

## متطلبات استكمال البناء المحلي

1. توفير Android SDK متوافق مع `compileSdk 36` و`buildTools 36.0.0` وNDK `27.1.12297006`.
2. ضبط `ANDROID_HOME` أو `ANDROID_SDK_ROOT`، أو إنشاء `android/local.properties` يحتوي `sdk.dir` لمسار SDK فعلي.
3. تشغيل `pnpm install --frozen-lockfile` ثم `pnpm exec expo prebuild` عند تغير config plugins.
4. تشغيل `cd android && ./gradlew :app:assembleDebug`.
5. تثبيت APK على جهاز ARM64 فعلي واختبار llama.rn، الخدمة الأمامية، الإشعارات، TTS/STT، وتبديل نماذج 3–10GB.

لا يُعد تصدير Web أو تصدير JavaScript Android بديلاً عن APK أصلي؛ كما أن إضافة Kotlin لا تصل إلى المستخدم بتحديث JavaScript وحده، بل تحتاج Development Build أو APK/AAB جديداً.
