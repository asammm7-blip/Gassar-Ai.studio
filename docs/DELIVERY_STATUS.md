# حالة تسليم Gassar.AI — 16 نوفمبر 2026

## الحالة الحالية

المشروع على الفرع `main` ومتزامن مع مستودع GitHub المعتمد. النسخة الحالية تستخدم Expo SDK 57 وDevelopment Build و`llama.rn` لنماذج GGUF المحلية، مع خادم TCP محلي وواجهة HTTP متوافقة جزئياً مع OpenAI/Ollama.

## ما تم تثبيته في آخر مراحل الإصلاح

- إضافة تحقق `appId` إلى جلسات JWT حتى تُرفض الجلسات الموقعة لتطبيق مختلف.
- تقييد CORS إلى localhost ونطاقات Manus الموثوقة، مع دعم `CORS_ALLOWED_ORIGINS` كـ allowlist صريحة. لا يعكس الخادم أي Origin عشوائي مع credentials.
- توحيد قائمة المرفقات مع مسارات الاستخراج والإرسال الفعلية. تُرفض DOC/DOCX/PPT/PPTX والصوت/الفيديو مبكراً لأنها لا تملك حالياً مستخرجاً أو مسار inline مكتمل؛ لا ينتظر المستخدم فشلاً متأخراً بعد الاختيار.
- إضافة بوابة موارد قبل نسخ/تهيئة GGUF: فحص مساحة تخزين حرة مع هامش 512MB، وقراءة RAM الأصلية اختيارياً على Android مع رفض آمن عند عدم كفاية الذاكرة. غياب telemetry في Web أو بيئة الاختبار لا يمنع التشغيل.
- إزالة خدمة الأداء التي كانت تسمي Base64 تشفيراً وتعيد قيم تحسين ثابتة. أصبحت الخدمة تقيس زمن JavaScript فقط ولا تدّعي قياس RAM/CPU أو تشفيراً حقيقياً.
- إبقاء إشعار foreground لخادم Android، وأزرار الإيقاف المؤقت/الاستئناف/الإيقاف، وطلب إذن الإشعارات مرة واحدة، مع نافذة عائمة اختيارية تحتاج إذن `SYSTEM_ALERT_WINDOW` من المستخدم.
- إبقاء ABI الإنتاج على `arm64-v8a` فقط بما يتوافق مع `llama.rn` وملفات GGUF الكبيرة.

## نتائج الفحص الأخيرة

| الفحص | النتيجة |
|---|---|
| TypeScript (`pnpm check`) | ناجح |
| Vitest | 154 اختباراً ناجحاً في 17 ملفاً |
| أمان المزامنة (`pnpm test:sync`) | 40 اختباراً ناجحاً |
| Lint | ناجح؛ يظهر تحذير Node عن `type: module` في إعداد ESLint فقط |
| `git diff --check` | ناجح |
| Expo config | ناجح؛ SDK 57 وarm64 وDevelopment Client ظاهرة |
| Expo autolinking verify | ناجح: Everything is fine |
| Expo Web export | ناجح؛ 14 مساراً ثابتاً |
| Android Gradle محلي | متوقف قبل التجميع بسبب غياب Android SDK |
| اختبار APK على هاتف حقيقي | لم ينفذ داخل هذه البيئة |

## قيد البناء المحلي الحالي

آخر محاولة:

```text
SDK location not found. Define a valid SDK location with an ANDROID_HOME environment variable
or by setting the sdk.dir path in android/local.properties.
```

هذا عائق بيئي قبل Kotlin/Gradle compilation، وليس فشل TypeScript أو autolinking. إعداد المشروع يطلب حالياً `compileSdk 36` و`buildTools 36.0.0` وNDK `27.1.12297006`. لا يمكن اعتماد APK فعلي أو الادعاء أن الإشعارات وllama.rn تعمل على جهاز حقيقي دون Android SDK وجهاز/Development Build.

## اختبارات القبول المتبقية على Android فعلي

1. تثبيت Development Build من بيئة تحتوي Android SDK متوافقاً، ثم اختبار أول طلب إذن الإشعارات ورفضه وإعادته من إعدادات النظام.
2. تشغيل وإيقاف الخادم المحلي مرات متتالية، تعارض المنافذ، ظهور الإشعار في Notification Shade، أزرار الإشعار، والنافذة العائمة بعد منح الإذن.
3. تحميل نماذج GGUF بحجوم 3–10GB على أجهزة ARM64 مختلفة، وقياس الذاكرة الفعلية وسلوك تبديل النماذج.
4. اختبار TTS وSTT العربيين، القراءة التلقائية بعد اكتمال الرد فقط، واستمرار الخادم عند الانتقال إلى Acode أو تطبيق آخر.
5. التحقق من أن واجهات `/v1/chat/completions` و`/api/chat` و`/api/generate` ترفض الطلبات غير المدعومة بدلاً من تجاهلها.

الخادم المحلي لا يستخدم TLS؛ يجب إبقاء Bearer authentication مفعلاً وعدم تشغيله على شبكة غير موثوقة. التوافق مع OpenAI/Ollama جزئي ومقصود، وليس استنساخاً كاملاً لكل API أو نظام تنزيل نماذج Ollama.
