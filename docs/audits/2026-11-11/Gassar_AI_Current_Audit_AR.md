# تقرير التدقيق الحالي لمشروع Gassar.AI

**التاريخ:** 2026-11-11  
**النطاق:** مراجعة نتائج محاور البناء والوحدات الأصلية، GGUF/llama.rn والخادم المحلي، الدردشة والواجهة، السحابة والهوية والأمان، المرفقات والرؤية، الصوت وTTS، والاختبارات وجاهزية التسليم.  
**قاعدة الأدلة:** لا يُعد نجاح فحص المصدر أو TypeScript أو autolinking دليلاً على ترجمة Android أو تشغيل native أو نجاح جهاز فعلي.

## 1. الحكم التنفيذي

الحالة الحالية هي **مكتمل جزئياً مع فجوات تحقق حرجة، وغير صالح بعد كإصدار أصلي موثّق**. توجد بنية تطبيق حقيقية وليست واجهة شكلية بالكامل: الدردشة والحفظ المحلي والتحكم في الطلبات، إدارة ملفات GGUF، مسار llama.rn الأصلي، خادم TCP محلي، واجهات OpenAI/Ollama الجزئية، اختيار المرفقات، بعض اختبارات العقود، وخدمة الصوت/التعرف موجودة في الشجرة. كما أن `pnpm check` نجح، ونجحت الاختبارات المصدرية الحالية وفق النتيجة المسجلة: **15 ملف اختبار ناجحاً، 147 اختباراً ناجحاً، واختبار واحد متخطى**، إضافة إلى نجاح اختبار المزامنة 40/40.

لكن لا يوجد في الأدلة الحالية APK/AAB مبني ومثبت، ولا Gradle assemble ناجح، ولا ترجمة مثبتة لأصناف Kotlin أو JSI، ولا اختبار هاتف. البيئة التي أُجريت فيها الفحوص على `aarch64`، و`ANDROID_HOME` و`ANDROID_SDK_ROOT` فارغان. توثيق البناء يسجل فشل Gradle بسبب `SDK location not found`، كما يسجل أن Hermes المعتاد تعطل بسبب `hermesc x86-64` على مضيف ARM64، وأن `--no-bytecode` نجح فقط كمسار التفاف، لا كإثبات إصدار Android كامل.

المخاطر الأشد هي: إعلان `armeabi-v7a` مع اعتماد GGUF/llama.rn لا يملك مسار 32-bit مثبتاً؛ غياب التنفيذ الأصلي المتوقع لوحدة telemetry في الحزمة الحالية؛ عدم وجود بوابة native قبل الإصدار؛ عيوب OAuth/JWT/CORS وتخزين كلمات المرور؛ عدم وجود RAG فعلي؛ إعدادات TTS/القراءة التلقائية غير موصولة؛ ودعم مرفقات معلن أوسع من التنفيذ. لذلك يجب اعتبار المشروع **جاهزاً لتقدم JS/source محدود، وليس جاهزاً لتسليم production native أو اعتماد أمني**.

### ما هو مؤكد، وما هو غير مثبت

- **مؤكد من الشجرة/الفحوص:** اتساق Expo 57 وReact Native 0.86.3، `expo-modules-autolinking verify` أعاد `Everything is fine`، وجود الاعتماد المحلي من `packages/gassar-device-telemetry`، نجاح TypeScript، ووجود مسارات المصدر المذكورة في هذا التقرير.
- **مخاطر تشغيلية:** GPU/CPU fallback، ذاكرة النموذج، foreground service، backpressure، أداء البث، صلاحيات الصوت، توافق URI، وسلوك Android/OEM.
- **غير مثبت على الجهاز:** APK/AAB، ترجمة Kotlin، دمج manifest النهائي، JSI/llama.rn، تشغيل GGUF أو mmproj، تشغيل الخدمة في الخلفية، التعرف العربي المحلي، TTS، الحرارة والذاكرة، OAuth وSecureStore وdeep links على جهاز/متصفح إنتاجي.

## 2. المعمارية الحالية كما تدعمها الأدلة

1. **طبقة التطبيق:** Expo Router وشاشات Home/Chat/Settings/Voice، مع `ChatContext` و`ChatController` وطبقة تخزين محلي ومسارات draft/regenerate/cancel.
2. **الاستدلال المحلي:** `local-model-manager.ts` ينسخ GGUF إلى `documentDirectory`، يتحقق من الملف ويحفظ metadata، ثم يهيئ runtime عبر `gguf-runtime.native.ts` الذي يفوض إلى `llama.rn`. المنصة غير الأصلية مرفوضة صراحة عبر `gguf-runtime.ts`.
3. **الخادم المحلي:** `local-model-server.ts` يفتح TCP API ولوحة حالة، ويطبق Bearer auth، ويدعم مسارات OpenAI/Ollama جزئياً، البث، tool calls، وmaterialization محدوداً للصور والصوت والمستندات.
4. **الوحدات الأصلية:** الحزمة المحلية `packages/gassar-device-telemetry` تحتوي واجهة TypeScript و`expo-module.config.json` وGradle/Manifest، لكن لا تظهر فيها أصناف Kotlin التي يسجلها الاسم أو الخدمة. نجاح autolinking هنا resolver check فقط.
5. **السحابة والهوية:** BYOK عبر `SecureStore` وadapters للمزودين، مع خادم OAuth/JWT وcookies/CORS. المسار المحلي في `auth-service.ts` منفصل عن هوية الخادم وليس بديلاً عن OAuth موثوق.
6. **المرفقات:** تحقق MIME والحجم، استخراج نص محدود، snapshots، وإرسال صور/بيانات inline لبعض المزودين؛ لا توجد طبقة embeddings أو vector retrieval.
7. **الصوت:** `expo-speech-recognition` للتعرف المحلي، و`lib/tts-service.ts` كطبقة TTS موجودة لكنها غير مستهلكة في مسارات التشغيل التي فُحصت؛ الشاشات تستدعي `expo-speech` مباشرة.

## 3. جدول الحالة حسب المحور

| المحور | الحالة الحالية | مستوى الدليل | الالتزامات/الفجوات الرئيسية |
|---|---|---|---|
| البناء وExpo/Android | إعدادات Expo/autolinking وTypeScript سليمة؛ البناء الأصلي غير مثبت | confirmed-code + unverified-device | SDK/NDK غير متاحان، لا APK، ABI 32-bit غير صالح، EAS غير مثبت البيئة |
| الوحدات الأصلية/telemetry | الاعتماد مربوط من `packages`؛ API JS اختيارية | confirmed-code، compilation غير مثبت | لا Kotlin مطابق للأسماء المسجلة؛ لا إثبات service أو قياسات فعلية |
| GGUF/llama.rn | مسار مصدر حقيقي مع GPU محاولة وCPU fallback وخادم محلي | tested-source + runtime-risk | لا سياسة ذاكرة/quantization، لا اختبار GPU/CPU أو lifecycle على جهاز |
| الخادم المحلي | HTTP/TCP/broadcast/auth وmaterialization موجودة | tested-source/mock جزئياً | إلغاء، backpressure، pause، foreground acknowledgement، وstale telemetry غير محسومة |
| الدردشة والحالة | ChatController والحفظ والإلغاء ومسارات الأزرار حقيقية | confirmed-code | TTS غير موصول، إنشاء سجل فارغ محتمل، bubbling، drawer لا يُفك فعلياً |
| السحابة والهوية | BYOK وadapters وخادم OAuth موجودة | confirmed-code، runtime غير مثبت | OAuth غير آمن بما يكفي، JWT طويل وغير قابل للإبطال، CORS/cookie واسع، كلمات مرور SHA-256 |
| المرفقات/RAG | تحقق واستخراج نص محدود وصور لبعض المزودين | confirmed-code | لا RAG، صيغ معلنة غير مدعومة، snapshot يتعارض مع OpenAI/OpenRouter |
| الصوت وTTS | recognition native موصول مصدرية؛ TTS مركزي غير موصول | confirmed-code + unverified-device | لا إثبات محرك/حزمة عربية، الإعدادات لا تحكم النطق، on-device قد يمنع الاستخدام |
| الاختبارات والتسليم | 147 ناجحاً و1 متخطى و`pnpm check` ناجح | tested-source، mocks كثيرة | auth متخطى، native غائب، أرقام docs متعارضة 147/152 و96، لا بوابة release |

## 4. الإصلاحات الأخيرة والقيود المعروفة

- **Autolinking:** `pnpm exec expo-modules-autolinking verify` ينجح، والاعتماد المحلي يقفل في `pnpm-lock.yaml`. هذا يثبت اكتشاف dependency/resolver فقط، ولا يثبت وجود class أو compilation أو دمج service.
- **expo-constants:** يظهر `expo-constants 57.0.23` مرة واحدة في lockfile، وهو اتساق graph جيد؛ لا ينبغي تحويله إلى إثبات APK أو حل لمشكلة native غير المبنية.
- **Android SDK:** ما زالت المشكلة التشغيلية قائمة في بيئة الفحص: `ANDROID_HOME` و`ANDROID_SDK_ROOT` فارغان وGradle سجل `SDK location not found`. يلزم SDK/NDK/Java معروفون داخل صورة بناء موثقة.
- **Hermes على ARM64:** توثيق البناء يسجل تعذر `hermesc` المعتاد لأنه x86-64 على مضيف `aarch64`، مع نجاح `--no-bytecode` فقط. هذا ليس دليلاً على نجاح production Hermes أو سلامة runtime.
- **Expo SDK 57:** توجد ترقية SDK 57 معزولة في شجرة/مسار سابق، لكنها **لم تُرفع بسبب lint**. لا يجوز اعتبارها الإصدار المعتمد أو احتسابها كإصلاح منشور؛ يلزم إعادة lint ثم commit/build موثق.
- **إعادة إنتاج EAS:** `eas.json` يعرّف profiles، لكن لا يثبت Node/pnpm/EAS CLI أو صورة البناء أو Java/SDK/NDK أو environment لكل profile. `package.json` يثبت pnpm فقط، ولا توجد release scripts تربط check/test/lint/native gate.

## 5. قائمة دقيقة بالمشاكل والنواقص والتعارضات والأكواد الوهمية

### 5.1 البناء والوحدات الأصلية

- **P1 مؤكد:** `app.config.ts:153-155` يعلن `armeabi-v7a` و`arm64-v8a` بينما llama.rn/GGUF لا يملك مسار 32-bit مثبتاً. الإنتاج يجب أن يكون arm64-v8a فقط، أو profile 32-bit بلا GGUF.
- **P1 غير مثبت على الجهاز:** لا APK/AAB أو Gradle/Kotlin/manifest/JSI أو اختبار جهاز.
- **P1 مؤكد/مخاطرة تشغيلية:** `packages/gassar-device-telemetry` لا يظهر فيه `GassarDeviceTelemetryModule.kt` أو `GassarServerService.kt`، رغم تسجيلهما في config/manifest. `src/index.ts` optional wrapper قد يعيد `null/false` أو يرمي رسالة بناء جديد.
- **P2 مؤكد:** EAS غير قابل لإعادة الإنتاج بما يكفي، ولا توجد بوابة release موحدة.
- **تعارض وثائقي:** تقارير 2026-11-07 تشير إلى `modules/gassar-device-telemetry` وKotlin، بينما الشجرة الحالية تعتمد `packages/...` ومجلد `modules` المحدد فارغ.
- **تعارض دلالي:** نجاح autolinking وظهور dependency مرة واحدة لا يثبت compilation أو وجود الخدمة.

### 5.2 GGUF والخادم المحلي

- **P1 مؤكد:** أي استثناء في init يُعامل كفشل GPU ثم يذهب إلى CPU، ما يخفي أخطاء ملف/ذاكرة/ربط.
- **P1 runtime-risk:** لا admission policy للذاكرة والتخزين وKV cache؛ `n_gpu_layers=99` و`n_ctx=4096` وإعدادات الدفعات ثابتة.
- **P1 runtime-risk:** إعلان الخادم running بعد `updateServerService` لا يثبت وصول foreground service إلى `startForeground` أو reconciliation بعد قتل الخدمة.
- **P2 مؤكد:** `STOP_WORDS` مصفوفة مشتركة تمرر بالمرجع؛ يلزم clone لكل طلب.
- **P2 مؤكد:** فحص body يسمح برسالة أخيرة بلا content ثم قد يفشل بخطأ داخلي بدل 400.
- **P2 runtime-risk:** timeout/قطع socket قد يتركان `activeSessions/generating` حتى settle؛ والبث بلا سقف pending bytes أو backpressure.
- **P2 مؤكد:** pause يرفض الطلبات الجديدة ولا يوقف التوليد القائم أو يحرر الموارد.
- **P2 مؤكد:** UI تقول إن الصور والأدوات غير مدعومة بينما server ينفذ مسارات لها؛ وواجهة Ollama أضيق من وصف التكامل.
- **P2 مؤكد/runtime-risk:** telemetry يعرض آخر عينة بلا timestamp/stale flag ويطلق refresh دورياً دون single-flight.
- **P2 تعارض:** capabilities المستنتجة من اسم الملف/metadata ليست probing موثوقة؛ progress لا يثبت تقدم tensor فعلياً.

### 5.3 الدردشة والواجهة

- **P1 مؤكد:** إعدادات TTS/auto-read محفوظة، لكن لا مستهلك في ChatScreen أو مسار وصول رد assistant.
- **P2 مؤكد:** زر more داخل Touchable الأب قد يفتح المحادثة والقائمة معاً.
- **P2 مؤكد:** Home ينشئ conversation قبل draft/navigation؛ فشل الانتقال قد يترك سجلاً فارغاً.
- **P2 مؤكد:** شرط فك Sidebar يفحص كائن `Animated.Value` truthy دائماً، فيبقى mounted ويعتمد على `pointerEvents`.
- **P3 مؤكد:** تغيير اللغة يحفظ `gassar_language` ويغيّر النص المحلي فقط؛ لا مزود i18n شامل.

### 5.4 الهوية والأسرار والأمان

- **P1 مؤكد:** كلمات المرور SHA-256 مباشر بلا salt/KDF ومخزنة مع بيانات الحساب في AsyncStorage.
- **P1 مؤكد:** Google/Apple في `auth-service.ts` محاكاة محلية تقبل IDs من المستدعي ولا تتحقق من مزود.
- **P1 مؤكد:** OAuth state مبني من redirect وليس nonce عشوائياً أحادي الاستخدام؛ لا PKCE/nonce ظاهر.
- **P1 مؤكد:** callback يثق بـ`sessionToken/user` من query/deep-link دون `/api/auth/me` أو تحقق خادمي مستقل.
- **P1 مؤكد:** JWT صالح سنة تقريباً ولا denylist/إبطال فعلي عند logout؛ `verifySession` لا يفرض appId/issuer/audience، وهناك تعارض name الفارغ بين الإصدار والتحقق.
- **P1 مؤكد:** CORS يعكس Origin مع credentials، وcookie domain مشتق من آخر مقطعين لأي hostname مع SameSite=None.
- **P2 مؤكد:** Gemini API key في query parameter؛ سجلات URL/proxy خطر غير ضروري.
- **P2 مؤكد:** سجلات API/auth تعرض URL وheaders وSet-Cookie وأجزاء token وcode/state وبيانات الأخطاء.
- **P2 مؤكد:** env لها قيم فارغة افتراضية بلا fail-fast، وhealth يعيد ok حتى دون readiness؛ body limit عام 50MB ولا rate limit ظاهر.
- **P2 مؤكد:** BYOK يرسل المفاتيح مباشرة من العميل للمزودين؛ يلزم توضيح السياسة وredaction.
- **P3:** اختبارات السحابة وSecureStore mocks فقط، واختبار logout متخطى.

### 5.5 المرفقات والرؤية وRAG

- **P1 مؤكد:** لا RAG فعلي: لا chunking/embeddings/vector store/retrieval/citations؛ الموجود إلحاق النص الكامل بالـprompt.
- **P1 مؤكد:** DOC/DOCX/PPT/PPTX مقبولة في MIME لكن extractor لا يدعمها، فتصل إلى فشل تجهيز.
- **P1 مؤكد:** snapshot قد يحفظ file inline لمزود غير Gemini؛ أول إرسال قد ينجح بالنص المستخرج ثم تفشل إعادة الاستخدام لأن request-builder يرفض file.
- **P2 مؤكد:** PDF parser محدود، بلا OCR عام أو معالجة ترميز/تشفير موثوقة.
- **P2 مؤكد:** audio/video مقبولة في UI لكنها غير مدعومة عملياً في builder المحلي/السحابي إلا شروط ضيقة.
- **P2 runtime-risk:** غياب `data.size` قد يمرر قراءة بلا حد فعلي ويستهلك الذاكرة.
- **P2 runtime-risk:** `data:` و`blob:` مقبولان لكن توافق قارئ Expo الفعلي غير مثبت.
- **P3:** preview يفتح URI فقط وليس OCR/RAG، والفشل يسجل تحذيراً.

### 5.6 الصوت وTTS

- **P1 مؤكد:** `lib/tts-service.ts` غير مستورد في مسارات التشغيل؛ الشاشة تستدعي `Speech.speak` مباشرة.
- **P1 مؤكد:** auto-read لا يراقب رسائل assistant، مع أن الإعداد ظاهر للمستخدم.
- **P2 مؤكد:** voice screen تثبت `ar-SA` وتتجاوز rate/voice/volume/enabled/autoRead.
- **P2 مؤكد:** `startedSpeaking=true` قبل `Speech.speak` وقد تبقى الحالة speaking عند exception متزامن.
- **P2 runtime-risk:** فرض `requiresOnDeviceRecognition` يفشل على أجهزة لا توفر المحرك المحلي بدلاً من fallback اختياري.
- **P2/P3 غير مثبت:** Google Speech والحزمة العربية وOEM وعودة `VOICE_INPUT_SETTINGS` تحتاج جهازاً.
- **تعارض:** نصوص offline لا تثبت أن كامل المسار يعمل بلا اتصال؛ RECORD_AUDIO في config لا يثبت build native محدثاً.

### 5.7 الاختبارات والأكواد الوهمية

- **P1 مؤكد:** `tests/auth.logout.test.ts` متخطى صراحة.
- **P1 غير مثبت:** لا APK/AAB/جهاز رغم اكتمال بعض source tests.
- **P1 runtime-risk:** local-server-http يستخدم GGUF/model manager وTCP/Expo mocks؛ لا يثبت JNI أو mmap أو ذاكرة أو cancel native.
- **P2 مؤكد:** `advanced-features.test.ts` ينشئ كائنات وقيم اختبار ولا يستورد production components/services، فهو shape/smoke test.
- **P2:** cloud tests تستخدم fetch/SecureStore fixtures، وUI tests تستبدل React/Router/native.
- **تعارض أرقام:** `IMPLEMENTATION_STATUS.json` يذكر 152 passed، التشغيل الحالي 147 passed و1 skipped؛ `DELIVERY_STATUS` يذكر 96 passed، كما تختلف أرقام التحذيرات 27/33. يلزم توليدها آلياً من SHA وtimestamp.
- **التزام سابق pending:** ملكية bytes للمرفقات، ميزانيات التوكن، advanced samplers، pendingNative، APK/JSI والجهاز ما زالت غير مغلقة وفق الحالة السابقة.

## 6. خطة الإصلاح المرتبة

### P1 — مانع الإصدار

1. استعادة/إضافة التنفيذ الأصلي الفعلي لوحدة telemetry داخل `packages` أو تصحيح مسار الحزمة، ثم بناء APK نظيف وفحص manifest والـclasses والخدمة.
2. إزالة `armeabi-v7a` من production، واعتماد arm64-v8a فقط أو profile 32-bit محدود بلا GGUF.
3. إنشاء native release gate في صورة SDK/NDK/Java معروفة، باستخدام commit SHA وfrozen lockfile، وإنتاج APK/AAB قابل للتتبع.
4. اختبار Android ARM64 حقيقي: load GGUF، GPU، CPU fallback، mmproj، start/pause/resume/stop، timeout، restart، foreground service، الإشعارات، الذاكرة والحرارة.
5. إصلاح OAuth: state عشوائي أحادي الاستخدام، PKCE، exchange خادمي، `/me` للتحقق، منع sessionToken/user من URL كهوية نهائية، وallowlist للـredirect.
6. تقصير JWT وإضافة session/refresh قابلة للإبطال وlogout فعلي، والتحقق الصريح من appId/issuer/audience.
7. استبدال SHA-256 المباشر بـArgon2id أو scrypt مع salt، وعدم اعتبار AsyncStorage مصدر هوية خادمية.
8. إضافة admission policy للنموذج وتصنيف أخطاء init قبل CPU fallback.
9. إما تنفيذ RAG فعلي مع provenance أو إزالة تسمية RAG من المنتج؛ وتوحيد دعم المرفقات قبل الإعلان عنها.
10. ربط TTS/auto-read فعلياً أو إزالة الوعد من الإعدادات.

### P2 — قبل بيتا موثوقة

1. تثبيت Node/pnpm/EAS CLI والصورة وJava/compileSdk/buildTools/NDK وenvironment لكل EAS profile، وإضافة pre-release check/test/lint/native gate.
2. إصلاح STOP_WORDS، body validation، cancellation cleanup، backpressure، pending bytes، pause semantics، وforeground acknowledgement.
3. توحيد capability contract بين manager/server/UI للمحتوى والصور والأدوات والصوت وOllama.
4. إصلاح bubbling، rollback لإنشاء المحادثة، فك drawer، stale telemetry وsingle-flight.
5. تقييد CORS/cookies، نقل Gemini key من URL، وتعقيم logs، وfail-fast/readiness/rate limits وحدود body حسب route.
6. توحيد MIME/extractor/request-builder، دعم أو رفض DOC/DOCX/PPT/PPTX، PDF/OCR، حدود URI والذاكرة، وprogress 1-based.
7. فصل سياسة Android notification/service عن iOS، وإضافة fallback صوتي معلن أو رسالة عدم توفر واضحة.
8. إزالة skip من auth أو توثيق عدم الدعم، وإضافة اختبارات claims/OAuth/logout/401/429/503.
9. إعادة توليد أرقام الحالة من تقارير الاختبار وربطها بـcommit وتاريخ.

### P3 — تحسينات لاحقة

1. تطبيق i18n شامل بدلاً من تخزين اللغة فقط.
2. إضافة اختبارات وحدات TTS، split، settings، URI، extractor fixtures الحقيقية، وcapability matrix.
3. فصل suites إلى source-tested وmocked-contract وnative-device وإظهار skipped/blockers.
4. تحسين preview، citations، سياسات المحتوى، ومراقبة الأداء/الحرارة طويلة التشغيل.

## 7. بوابات قبول عملية

لا يُقبل الإصدار إلا بعد تحقق جميع البوابات التالية وتسجيل SHA وartifact وبيئة التشغيل:

1. **بوابة البناء:** `pnpm check` وlint وtests دون skipped غير مبرر؛ EAS/Gradle يبني APK/AAB من صورة موثقة وبـfrozen lockfile، وHermes يعمل أو يكون مسار no-bytecode قراراً موثقاً ومختبراً.
2. **بوابة ABI:** تحليل APK/AAB يثبت arm64-v8a فقط للإصدار الذي يشغل GGUF، ووجود native classes/service وmanifest permissions المدمجة.
3. **بوابة الجهاز:** Android ARM64 حقيقي يثبت تثبيتاً نظيفاً، أول تشغيل، صلاحيات، start/stop/pause/resume، خلفية، قتل/عودة، تعارض منافذ، وبدءاً بلا Metro.
4. **بوابة النموذج:** نماذج 3–10GB ممثلة حسب quantization؛ load metadata، GPU إن توفر، CPU fallback، mmproj، OOM policy، cancel/timeout، وقياس RAM/حرارة.
5. **بوابة API:** Bearer auth، 400 للطلبات الناقصة، stream/backpressure، stop bounded، ورفض العميل البطيء؛ اختبار OpenAI/Ollama المعلن فقط.
6. **بوابة الأمن:** OAuth state/PKCE/replay، wrong app/expired/missing-name claims، logout مع Bearer قديم، CORS/cookie allowlist، redacted logs، readiness وrate limits.
7. **بوابة المرفقات:** كل MIME معلن يمر fixture حقيقي أو يُرفض قبل الاختيار؛ PDF/OCR/حدود الحجم/إعادة التوليد للمزودين موثقة، ولا ادعاء RAG بلا retrieval/citations.
8. **بوابة الصوت:** Android 13/14+ مع رفض/منح/revocation للصلاحيات، محرك وحزمة ar-SA، on-device أو fallback معلن، TTS settings وauto-read فعليان، ومعالجة stop/error.
9. **بوابة التوثيق:** توحيد أرقام 147/152/96 و27/33، ووسم كل نتيجة بـconfirmed-code أو mocked-contract أو runtime-risk أو unverified-device؛ لا تُستخدم عبارة ready/release مع pendingNative أو غياب APK.

## 8. الخلاصة

العمل الحالي يثبت تقدماً حقيقياً في طبقة JavaScript والمنطق المحلي، لكنه لا يثبت المنتج الأصلي القابل للتسليم. الأولوية ليست إضافة واجهات جديدة، بل إغلاق سلسلة الدليل من المصدر إلى native artifact إلى جهاز ARM64، ثم إغلاق الهوية والأسرار وTTS/RAG والمرفقات. إلى أن تُغلق بوابات P1، يجب عرض المشروع داخلياً بوصفه **validation-gapped / native-unverified**، مع إبقاء جميع الالتزامات السابقة المذكورة أعلاه في حالة `pending` وعدم تحويل نجاح autolinking أو الاختبارات المعتمدة على mocks إلى اعتماد إصدار.
