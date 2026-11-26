# البناء والاستقرار الأصلي في Gassar.AI

النسخ الأساسية المقفلة متسقة: Expo ‏57.0.24 مع React Native ‏0.86.3 وReact/React DOM ‏19.2.3، وReanimated ‏4.5.1 وWorklets ‏0.10.1. لم أجد دليلاً يبرر وصف هذه المجموعة بأنها غير متوافقة. المشكلات الأهم في هذا المجال هي إعلان دعم Android ‏32 بت بينما المحرك يدعم 64 بت فقط، وغياب ميزانية فعلية للنماذج الكبيرة، وتداخل عمليات تهيئة الجلسات، ثم فجوات نطاق المنصات واختبار المنتج الأصلي.

**خط الأساس:** الالتزام `5bbeab16221b04c55657b65aba910977f4a5f287` بتاريخ 2026-11-07. المقارنة مع HEAD وقت الفحص أظهرت إضافة `docs/PROJECT_AUDIT_SCOPE.md` فقط. لم أعدل المصدر أو التهيئة أو الحزم أو hooks، ولم أشغل بناء جديداً أو تثبيتاً. المحاكاة أدناه قرأت المصدر وعرّضت توابعه لبدائل داخل ذاكرة Node فقط؛ لم تشغل llama.cpp أو Kotlin على جهاز. هذا تقرير المجال المحدد، وليس ادعاء اكتشاف كل عيب ممكن في المشروع.

أستخدم P1 للمرتفع، وP2 للمتوسط، وP3 للتحسين؛ لم أثبت عيباً P0 حرجاً في هذا المجال. `confirmed-code` يعني أن السلوك أو النقص ثابت في المصدر، و`reproduced-local` يعني أن ترتيباً أو خللاً أعيد إنتاجه محلياً ببدائل، و`runtime-risk` يعني أن الأثر الفعلي على الهاتف لم يختبر، و`unverified-device` يعني غياب إثبات على منتج أصلي أو جهاز. غياب تشغيل GGUF على الويب وExpo Go قيد مقصود `intentional-limit`؛ العيب ليس غياب المحرك عنهما، بل عدم جعل الواجهة ومسار الاستيراد يلتزمان بهذا القيد مبكراً.

## ما هو منفذ وقوي في هذا المجال

**اتساق SDK وReact مثبت محلياً.** تثبيت Expo وReact Native وReact في `package.json:45-45` و`package.json:81-91` يطابق نسخ `pnpm-lock.yaml:53-55` و`pnpm-lock.yaml:161-193`. مصفوفة Expo المرفقة مع الحزمة المثبتة، `node_modules/expo/bundledNativeModules.json:101-114`، توصي بهذه النسخ نفسها للحزم الأساسية. متطلبات React Native المقفلة تقبل React ‏19.2.3 وأنواع React ‏19.1.17 (`pnpm-lock.yaml:5216-5228`)؛ اختلاف رقم نسخة الأنواع عن React ليس وحده دليلاً على عيب. يوجد استثناء أدوات تطوير: `eslint-config-expo` مثبت على ‏10.0.0 في `package.json:108-108` و`pnpm-lock.yaml:237-239` بينما المصفوفة توصي ‏57.0.2 في `node_modules/expo/bundledNativeModules.json:16-16`. لم أثبت أنه سبب أخطاء تشغيل، وlint في خط الأساس ناجح؛ يستحق المحاذاة ضمن صيانة الأدوات، لا إعلان فشل SDK.

**تسجيل وحدة Android المحلية صحيح على مستوى الاكتشاف.** الحزمة مرجعية محلية في `package.json:76-76` و`pnpm-lock.yaml:146-148`، واسم الصنف في `modules/gassar-device-telemetry/expo-module.config.json:1-6` يطابق `modules/gassar-device-telemetry/android/src/main/java/com/gassar/device/telemetry/GassarDeviceTelemetryModule.kt:1-19`. الوحدة تستخدم `expo-module-gradle-plugin` بدلاً من نسخ إعدادات Kotlin/SDK يدوياً (`modules/gassar-device-telemetry/android/build.gradle:1-15`). تشغيل resolver المحلي للـ autolinking، دون Gradle build، اكتشف الصنف ومسار `modules/gassar-device-telemetry/android`. هذا إثبات اكتشاف، لا إثبات ترجمة الوحدة أو وجودها داخل APK.

**هناك حواجز تمنع انهيارات يمكن تجنبها.** غلاف القياسات يستخدم `requireOptionalNativeModule`، ويعيد `null` أو `false` عند غياب الوحدة، ويعطي رسالة واضحة عند طلب تشغيل الخدمة دون بناء Android جديد (`modules/gassar-device-telemetry/src/index.ts:28-55`). تهيئة إشعارات الجذر محاطة بـ catch وتعالج اكتمال الوعد بعد unmount (`app/_layout.tsx:46-53`)، والاشتراكات تنظف عند الخروج (`lib/local-server-notifications.ts:122-140`). `llama.rn` يستعمل `TurboModuleRegistry.get` الاختياري ولا يثبت JSI إلا عند الاستخدام (`node_modules/llama.rn/src/NativeRNLlama.ts:1-8` و`node_modules/llama.rn/src/index.ts:180-191,1369-1374`). لذلك لا أزعم أن مجرد الاستيراد يكسر بدء التطبيق في Expo Go.

**توليد أصلي وإنتاج منفصلان في التعريف.** توجد أوامر Android/iOS وdev-client وprebuild وثلاثة ملفات تعريف Android (`package.json:17-23`). ملف development يبني عميل تطوير APK، وpreview يطلب APK داخلياً، وproduction يستخدم زيادة رقم البناء عن بعد (`eas.json:1-23`). وجود `expo-dev-client` في الاعتمادات/plugin لا يثبت وحده أن نسخة production تعرض أدوات التطوير؛ ملف production لا يطلب `developmentClient:true`. المرجع الرسمي يوضح أن هذا العلم يختار بناء Debug، بينما الافتراضي false [1].

**اختيارات السلامة الأصلية معقولة لكنها ليست ضمان تشغيل.** خدمة Android غير مصدّرة، وتعلن `specialUse` بوصف حالة استخدام وتعمل `START_NOT_STICKY` وتنظف النافذة والقفل عند إيقافها (`modules/gassar-device-telemetry/android/src/main/AndroidManifest.xml:2-10` و`modules/gassar-device-telemetry/android/src/main/java/com/gassar/device/telemetry/GassarServerService.kt:30-35,76-80,114-121`). بدء الخدمة من التطبيق مشروط بكونه في foreground على Android (`lib/local-model-server.ts:156-161`). إعدادات GPU اختيارية في الـ manifest المولد بواسطة plugin، مع `android:required=false`، ويوجد fallback إلى CPU (`app.config.ts:97-104`، `node_modules/llama.rn/src/expo-plugin/withLlamaRN.ts:117-149`، `lib/local-model-manager.ts:212-242`). أصول llama المنزلة بواسطة postinstall مربوطة بنسخة وبـ SHA-256، وتتحقق قبل الاستخراج (`node_modules/llama.rn/package.json:42-50`، `node_modules/llama.rn/install/download-native-artifacts.js:185-214`، `node_modules/llama.rn/install/native-artifacts.json:2-18`). لم أجد تنزيلاً أعمى غير محقق في هذا المسار.

## النتائج والإصلاحات الجذرية

### BLD-001 — دعم ABI المعلن أوسع من قدرة محرك GGUF

**P1 · confirmed-code.** الدليل: `app.config.ts:144-150` يحدد `buildArchs` على `armeabi-v7a` و`arm64-v8a`. النسخة المحددة من المحرك في `package.json:78-78` و`pnpm-lock.yaml:152-154` تستبعد `armeabi-v7a` و`x86` صراحةً في `node_modules/llama.rn/android/build.gradle:96-100,171-175`، ويرفض المحمل الهاتف الذي لا يعلن ABI ‏64 بت في `node_modules/llama.rn/android/src/main/java/com/rnllama/RNLlama.java:173-179`. إعداد prebuild المحلي الناتج، لا مصدر مستقل، يحمل المعماريتين في `android/gradle.properties:31-31`.

**الأثر والسبب:** نطاق الأجهزة المعلن للمنتج لا يطابق المحرك المحوري. لا يستطيع مستخدم جهاز 32 بت تشغيل GGUF حتى لو عملت واجهة التطبيق. لا أثبت أن Gradle سيفشل بسبب ذلك أو أن التطبيق سينهار عند البدء؛ المشكلة المثبتة هي عدم إمكان الميزة على جزء من النطاق المعلن. كما أن ملف التطوير يستبعد x86_64 رغم وجود أصول للمحرك له، فيحتاج المختبر إلى جهاز ARM أو إعداد محاكي مناسب.

**الإصلاح الجذري:** إذا كان المنتج محلياً أصلياً أولاً، اجعل إنتاج Android ‏arm64-v8a فقط، مع ملف تطوير x86_64 منفصل إذا كان مطلوباً. إذا كان دعم 32 بت مطلوباً لوضع سحابي، عرّفه كمنتج محدود القدرات واعزل المحرك عنه، ولا تعرض تفعيل GGUF. افحص معمارية العملية نفسها ضمن سجل القدرات قبل اختيار نموذج.

**اختبار القبول:** تحليل APK/AAB النهائي يثبت أن كل ABI معلن يملك المكتبات اللازمة. اختبار arm64 يشغل نموذجاً صغيراً، واختبار جهاز 32 بت، إن بقي مدعوماً، يظهر الوضع المحدود قبل picker ولا ينفذ تهيئة محلية. اختبار محاكي التطوير يثبت install وبدء الواجهة حسب ABI الملف الخاص به.

### BLD-002 — سقف 16GiB ليس فحص ملاءمة للهاتف أو مساحة الاستيراد

**P1 · runtime-risk.** الدليل: `src/ml/model-safety.ts:1-1,26-35` يتحقق من امتداد GGUF وحجم موجب وسقف ثابت فقط. `tests/model-safety.test.ts:16-25` يؤكد قبول 10GiB، لا تشغيله. `app/models/index.tsx:119-130` يطلب أولاً نسخة في cache، ثم `lib/local-model-manager.ts:127-149,268-274` ينسخ الملف إلى التخزين الدائم دون قياس المساحة الحرة. `lib/local-model-manager.ts:212-240` يحدد سياقاً ودفعات وطبقات GPU ثابتة؛ و`lib/local-model-manager.ts:244-249` يسجل رقماً تقديرياً للذاكرة بعد التهيئة، ولا يستخدمه لمنعها. قياسات الذاكرة الكلية في `modules/gassar-device-telemetry/android/src/main/java/com/gassar/device/telemetry/GassarDeviceTelemetryModule.kt:35-43` ليست حارساً لاستيراد/تهيئة النموذج. plugin يضيف امتيازي ذاكرة iOS عند production أو NODE_ENV=production (`app.config.ts:97-104` و`node_modules/llama.rn/src/expo-plugin/withLlamaRN.ts:41-55`)؛ توثيق Apple يؤكد أن الذاكرة الإضافية متاحة لبعض الأجهزة فقط ويجب أن يعمل التطبيق دونها [3].

**الأثر والسبب:** ملف كبير مقبول قد يملأ cache والتخزين الدائم أو يفشل متأخراً، وقد تقتل ضغوط الذاكرة العملية بدلاً من رجوع Promise قابلة لـ catch. mmap يقلل تحميل الملف المسبق، لكنه لا يثبت ملاءمة صفحات الأوزان العاملة وKV cache وbuffers وGPU. الخلل هو خلط «حد الملف المسموح» بميزانية تشغيل فعلية. لم يحدث OOM على هاتف في هذا التدقيق، ولم أختبر استيراد 10GiB حقيقياً.

**الإصلاح الجذري:** أضف preflight قبل النسخ قدر الإمكان، وبعد قراءة metadata قبل التهيئة. احسب المساحة المطلوبة حسب استراتيجية النسخ مع احتياطي، والذاكرة المتاحة للعملية، وKV cache وفق نوع النموذج وطول السياق، وحدود GPU. اضبط n_ctx/batch/offload وفق الجهاز، وقدّم تحذيراً أو رفضاً له سبب قابل للفهم. اجعل الإلغاء والتنظيف الجزئي جزءاً من الاستيراد. لا تجعل امتيازات iOS بديلاً عن قياس الميزانية.

**اختبار القبول:** بدائل لنقص القرص تمنع النسخة الدائمة وتزيل الناتج الجزئي؛ بدائل لميزانية ذاكرة ضيقة تمنع init أو تخفض الإعدادات. على أجهزة منخفضة وعالية الذاكرة، اختبر نموذجاً صغيراً ثم نموذجاً يتجاوز الميزانية: رفض مسبق قابل للتفسير دون قتل العملية، مع سجل ذاكرة وقرص قبل وبعد. إصدار iOS يعمل برشاقة حتى دون ذاكرة إضافية.

### BLD-003 — تهيئة الجلسات غير متسلسلة: جلسة يتيمة وذروة ذاكرة عند التبديل

**P1 · reproduced-local.** الدليل: `lib/local-model-manager.ts:173-198` يحرس `generating` فقط، وينتظر ويهيئ دون promise/قفل activation مشترك. `lib/local-model-manager.ts:185-193` يهيئ الجديد قبل تحرير القديم. `lib/local-model-manager.ts:244-249` يكتب context واحداً لكل model.id في Map؛ و`lib/local-model-manager.ts:351-362` لا يستطيع تحرير إلا المرجع الموجود. المسار يصل من `lib/chat-context.tsx:258-276`، وزر `app/models/index.tsx:216-230` لا يحتوي disabled للتهيئة الجارية.

**الإعادة المحلية:** استدعاء `Promise.all([activateModel('A'), activateModel('A')])` على المصدر المترجم مع init بديل أعطى استدعاءَي init ومدخلاً واحداً في cache؛ وبعد deactivate تحررت الجلسة الثانية فقط وبقيت الأولى دون مرجع. اختبار A ثم B أعطى التسلسل `info A → init A → info B → init B → release A`. هذه نتائج حقيقية للمنطق مع بدائل، لا إثبات تسرب native أو OOM على هاتف.

**الأثر والسبب:** النقر المكرر أو مسارات الاستعادة المتزامنة قد تخصص أكثر من context، ثم يستبدل أحدهما الآخر دون release. التبديل المتسلسل نفسه يحمل جلستين مؤقتاً، فيضاعف الضغط عند استخدام نماذج كبيرة. السبب المشترك هو غياب ملكية ومعاملة انتقال موحدة للموارد الأصلية، لا غياب try/catch.

**الإصلاح الجذري:** اجعل عمليات activate/deactivate/delete/restore تابعة إلى queue أو mutex واحد، مع single-flight لكل activation وepoch للإلغاء. امنع التوليد خلال الانتقال. في وضع ذاكرة محدودة، أوقف العمل وحرر القديم قبل init الجديد، أو لا تسمح بالاحتفاظ به إلا بعد فحص ميزانية صريح. أي context ينشأ ثم لا يصبح المعتمد يجب release له في finally. عطّل زر التفعيل أثناء العملية، لكن لا تعتمد على الواجهة وحدها.

**اختبار القبول:** طلبان متزامنان للنموذج نفسه ينفذان init واحداً، والتبديل المتزامن لنموذجين ينتهي بجلسة واحدة وكل context مهجور محرر مرة واحدة. حقن فشل/إلغاء في كل مرحلة لا يترك موارد. تتبع A→B على هاتف يثبت أن الذروة تلتزم بالميزانية وأن الرجوع من الفشل لا يدعي نموذجاً محملاً دون جلسة.

### BLD-004 — القيد المقصود لـ Expo Go/الويب لا يفرض قبل استيراد الملفات

**P2 · confirmed-code.** الدليل: `src/ml/gguf-runtime.ts:35-40` يرفض التشغيل على الويب صراحةً. على native يدخل `src/ml/gguf-runtime.native.ts:1-11` إلى llama؛ عند غياب الوحدة يعيد `node_modules/llama.rn/src/NativeRNLlama.ts:8-8` مرجعاً غير متاح، ويستعمل `node_modules/llama.rn/src/index.ts:184-187,1369-1374` install في أول قراءة metadata. في المقابل `app/models/index.tsx:119-130` و`lib/local-model-manager.ts:117-165` يسمحان بالاختيار والنسخ والحفظ دون سؤال قدرات runtime؛ رسالة الحاجة إلى build لا تظهر إلا عند التفعيل/الفشل. الجذر يستورد المدير عبر `app/_layout.tsx:10-10` و`lib/chat-context.tsx:3-3`، لكن الربط الفعلي مؤجل؛ لا يوجد إثبات أن البداية نفسها تنهار. وثائق Expo تميز عميل التطوير الأصلي المخصص عن Expo Go وتفرض إعادة بناء عند إضافة native code [2].

**الأثر والسبب:** المستخدم قد ينسخ نموذجاً كبيراً ثم يكتشف عدم إمكان تشغيله. على Expo Go خطأ الجسر غير المتاح قد يظهر كخطأ JSI أو TypeError عام بدلاً من شرح القيد. على الويب قد يفشل filesystem قبل الوصول إلى stub. القيد نفسه مقصود؛ العيب هو عدم وجود capability gate موحد يسبق picker والنسخ والتفعيل.

**الإصلاح الجذري:** أنشئ فحص قدرة موحداً يشمل المنصة وبيئة Expo Go ووجود RNLlama وABI، ويعيد سبباً محدداً. اعزل runtime أو حمّله عند الحاجة، واعرض الدردشة السحابية والميزات الممكنة دون تشغيل الموارد المحلية. استعمل وصف «بناء أصلي» لا «Development Build فقط» في رسائل GGUF؛ production أصلي أيضاً.

**اختبار القبول:** الويب وExpo Go وبناء أصلي قديم بلا المحرك يظهرون سبب عدم الدعم قبل picker، ولا ينسخون ملفاً ولا يطلبون install. يبقى بدء الواجهة والوضع السحابي صالحين. development وpreview وproduction الأصلية المكتملة تمر عبر المسار المحلي بعد اكتشاف القدرات.

### BLD-005 — نطاق iOS لا يطابق اشتراط إشعارات Android أو دورة الحياة

**P2 · confirmed-code.** الدليل: `modules/gassar-device-telemetry/expo-module.config.json:2-5` يسجل الخدمة/القياسات لـ Android فقط. `lib/local-server-notifications.ts:122-125` لا يهيئ خدمة iOS، و`lib/local-model-server.ts:221-224` لا ينشئ foreground service له. مع ذلك `app/local-server.tsx:122-142` يشترط إذن إشعارات لكل منصة غير الويب ويمنع start عند الرفض، و`app/local-server.tsx:494-511` يعرض وصفاً لإعدادات Android حتى على iOS. `lib/local-model-server.ts:156-161` يرفض الويب فقط ويقدم Android/iOS باعتبارهما أصليين، دون observer يوقف أو يعلّق الخدمة عند مغادرة iOS. `app.config.ts:49-55,125-130` يحتوي وصف الشبكة المحلية وقدرات video في الخلفية؛ هذه ليست تنفيذ خدمة GGUF في خلفية iOS. توثيق Apple يوضح إمكان تعليق التطبيق بعد الانتقال إلى الخلفية [4].

**الأثر والسبب:** على iOS يُمنع خادم foreground بسبب رفض إذن لا يُستخدم لإنشاء إشعار خدمة أصلية أصلاً. ويغيب وصف صريح أن الاستمرار بعد الانتقال إلى تطبيق آخر ليس مكافئاً لخدمة Android. لم أثبت انقطاعاً على iPhone أو مشكلة وصول الشبكة المحلية؛ هذه آثار دورة حياة تحتاج الجهاز. عدم وجود خدمة iOS خلفية قيد منصة، لا ثغرة أمنية.

**الإصلاح الجذري:** افصل capability الخدمة الخلفية عن capability sockets foreground، واجعل اشتراط الإشعارات ووصفها خاصين بـ Android. اختر نطاق iOS واضحاً: foreground-only مع تحذير وإيقاف/تصالح حالة عند background/foreground، أو تعطيل خادم iOS إلى حين تنفيذ مسار أصلي مدعوم. لا تستخدم تشغيل صوت صامت أو صلاحيات video للتحايل على قيود النظام.

**اختبار القبول:** على iOS لا يمنع رفض الإشعارات بدء خدمة foreground المدعومة؛ وإذا كان الخادم معطلاً يظهر السبب بلا طلب إذن زائد. تبديل التطبيق وقفل الشاشة والعودة لا يبقي الحالة «يعمل» خلافاً للحقيقة. على Android تظل موافقة إشعار الخدمة شرطاً كما هو مقصود، ويعمل start/pause/resume/stop على جهاز.

### BLD-006 — الإيقاف المؤقت لا يحرر قفل إبقاء المعالج مستيقظاً

**P2 · confirmed-code.** الدليل: `lib/local-model-server.ts:279-299` يمرر paused إلى الخدمة دون إيقافها. `modules/gassar-device-telemetry/android/src/main/java/com/gassar/device/telemetry/GassarServerService.kt:37-43,69-74` يأخذ `PARTIAL_WAKE_LOCK` دون timeout بغض النظر عن paused؛ التحرير موجود فقط في `:114-120` عند onDestroy. طلبات الخادم أثناء paused ترفض في `lib/local-model-server.ts:468-469`. توثيق Android يشرح أن partial wakelock يمنع حالات الطاقة المنخفضة وأن مدته أثناء foreground service تدخل في القياس [5].

**الأثر والسبب:** مستخدم يترك الخدمة «متوقفة مؤقتاً» قد يظل يمنع نوم المعالج رغم عدم قبول عمل جديد. الضرر الواقعي هو استهلاك بطارية غير مبرر، وقد يؤثر طول الاستخدام في Android vitals؛ لم أقس البطارية أو أثبت تجاوز حد المتجر. استمرار الطلب الجاري عند pause يحتاج تحديداً واضحاً، ولا يصلح عذراً للاحتفاظ بالقفل بعد انتهائه إلى أجل غير محدود.

**الإصلاح الجذري:** اجعل القفل تابعاً للحاجة الفعلية: حرره في paused بعد اكتمال/إلغاء العمل الجاري، وخذه عند resume أو عمل يستلزم يقظة. إذا كان listener النشط يحتاج يقظة متواصلة فعلاً فاجعل ذلك وضعاً معلناً له مهلة أو مدة جلسة وإيقاف خمول، وجدّد timeout عند الحاجة مع cleanup موحد.

**اختبار القبول:** تحقق أصلـي من `isHeld` أو dumpsys بعد start ثم pause: يحرر القفل بعد انتهاء العمل ولا يبقى خلال خمول الشاشة. resume يعيد القفل فقط عند الحاجة؛ stop/failure/task removal لا يتركانه. قياس جلسة screen-off يكشف الفرق عن خط الأساس.

### BLD-007 — lockfile جيد، لكن بيئة EAS وأوامرها ليست عقداً قابلاً لإعادة الإنتاج

**P2 · confirmed-code.** الدليل: `package.json:117-117` يحدد pnpm ‏9.12.0، و`pnpm-lock.yaml:1-5` يحمل lockfile ‏9، و`.npmrc:1-1` يحدد linker hoisted. لكن `eas.json:1-23` يقبل أي CLI منذ ‏16.0.0 ولا يحدد node أو pnpm/corepack أو image أو environments صريحة. `package.json:21-23` يستدعي eas غير موجود في devDependencies، و`package.json:6-28` لا يربط أوامر إصدار Android بـ check/test أو verifier أصلي. المتطلبات المقفلة لـ RN تضبط الحد الأدنى لـ Node (`pnpm-lock.yaml:5216-5223`). `app.config.ts:1-2` يحمّل `scripts/load-env.js:13-49` الذي يقرأ البيئة ويحوّل متغيرات عامة؛ لم أفحص قيمها أو حساب EAS. وثائق EAS توفر حقول node وpnpm وimage وenvironment ووراثة profile [1].

**الأثر والسبب:** lockfile يعيد شجرة JS، لكنه لا يثبت نسخة Java/NDK/صورة EAS أو CLI الذي يجهز المشروع، ولا اعتماد بيئة endpoints موحدة لكل profile. قد يتغير بناء الالتزام نفسه مع الزمن أو اختلاف محطة المطور. هذه فجوة إعادة إنتاج وضبط نشر، وليست إثبات أن EAS يفشل أو أن كل المتغيرات مفقودة. حذف node_modules وإعادة التثبيت غير لازم لهذا التدقيق، ولم أنفذه.

**الإصلاح الجذري:** عرّف base profile بإصدارات أدوات متوافقة مجربة وصورة EAS صريحة، أو سياسة اختيار صورة مسجلة ثابتة لكل release؛ ثبّت EAS CLI في سلسلة الإصدار أو وثق نسخة مطلوبة دقيقة. فعّل package manager المحدد دون تجاهل lifecycle اللازم لتنزيل أصول llama، واستعمل frozen lockfile. عرّف environments لكل profile مع validation للمتغيرات العامة المطلوبة، دون نسخ أسرار إلى EXPO_PUBLIC. اجعل مسار إصدار موحداً يمر check/test/lint وnative verification، وحاذِ eslint-config-expo ضمن تحديث أدوات اختبره CI.

**اختبار القبول:** بنيان نظيفان للالتزام نفسه يسجلان نسخ Node/pnpm/EAS/Java/SDK/NDK وصورة البناء نفسها، ولا يعدلان lockfile، ويتفقان في graph/config والأصول الأصلية المقفلة. لا يشترط تطابق البايتات كاملة بسبب التوقيع/metadata. أمر release يمنع تجاوز الاختبارات الفاشلة، واختبار profile production يثبت بيئته ورقم البناء ونوع artifact ولا يعتمد على إعداد محطة خفي.

### BLD-008 — لا يوجد إثبات للمنتج الأصلي يسمح بتحويل نجاح JS إلى اعتماد إصدار

**P1 · unverified-device.** الدليل: أوامر البناء في `package.json:17-23` وملفات EAS في `eas.json:6-22` لا تقدم بذاتها نتيجة build أو device test. `vitest.config.ts:3-5` يشغل اختبارات TS؛ `tests/local-server-http.test.ts:5-10` يستبدل المنصة وtcp والمدير، و`tests/local-server-notifications.test.ts:5-17` يستبدل وحدة Android، و`tests/onnx-session.test.ts:1-38` يختبر helpers ولا يفتح جلسة ONNX أو GGUF رغم الاسم. السجل المحلي `/tmp/gassar-gradle.log:96-105` توقف عند غياب Android SDK قبل ترجمة وحدة التطبيق Kotlin، بينما الأسطر ‏24-77 تخص plugins للبناء وليست وحدة Gassar. `/tmp/gassar-android-export.log:5-11` فشل عند hermesc. الفحص read-only أكد المضيف aarch64 والمترجم ELF x86-64؛ هذا عائق أدوات المضيف لا برهان على عيب المصدر.

**الأثر والسبب:** صحة أنواع TS ونجاح الوحدات وprebuild وتصدير JS لا تختبر JNI/JSI أو manifest النهائي أو Kotlin أو Hermes bytecode أو توقيع production أو دورة foreground service. لهذا لا يثبت APK صالحاً ولا جهازاً يشغل النموذج. بوابة اعتماد native غير ممثلة في مسار الإصدار الحالي، ولا ينبغي إعلان تسليم أصلي مثبت استناداً إلى JS فقط.

**الإصلاح الجذري:** اجعل قبول الإصدار مشروطاً ببناء release أصلي في بيئة SDK ومضيف مدعومين، ثم smoke tests على artifact نفسه. تحقّق من autolinking داخل APK، ومن وجود JSI وCPU fallback وأذونات manifest المدمجة وإغلاق الخدمة. أضف تدقيق 16KB لجميع مكتبات ARM64/x86_64 المضيفة والـ APK والتجربة الفعلية؛ متطلبات Android تفرق بين محاذاة ELF وتغليف APK وruntime [6]. إعلان `specialUse` ووصفه في المصدر صحيحان شكلياً، لكن الموافقة/تصريح Play Console لا يمكن استنتاجهما: Android يطلب مراجعة حالة الاستخدام وتصريح الخدمة في المتجر [7].

**اختبار القبول:** سجل release build ناجح ينتج APK/AAB موثّقاً برقم/commit، ويفتح الواجهة دون Metro، ويحمل نموذج GGUF صغيراً ويولد ويفرغه. اختبر start/pause/resume/stop ورفض الأذونات ومنحها وقفل الشاشة/العودة وموت العملية وغياب التسريع. تحليل ELF و`zipalign -c -P 16` على الناتج ينجحان، وتشغيل على بيئة صفحات 16KB ينجح دون الاتكال على وضع توافق؛ ثم سجل موافقة/تصريح foreground service إذا كان النشر على Play مطلوباً.

## حدود التحقق التي تمنع استنتاجات زائدة

خط الأساس المنقول: TypeScript ناجح، و96 اختبار Vitest ناجح واختبار auth واحد متجاوز، و7 اختبارات Python sync ناجحة، وlint صفر أخطاء و33 تحذيراً. نجح prebuild وتصدير Web وتصدير Android JS دون bytecode. لم أعد تشغيل هذه المجموعة؛ هي صحة أولية مفيدة لا إثبات لجميع الميزات أو الأجهزة.

اكتشاف وحدة Gassar عبر autolinking أعيد محلياً واسم الصنف صحيح. لم تصل العملية إلى ترجمتها في Gradle أو دمج manifest نهائي كامل. `AndroidManifest.xml` الخاص بالتطبيق الناتج عن prebuild ليس manifest المنتج المدمج، ولذلك غياب خدمة Gassar منه وحده لا يثبت فشل الدمج: بيان المكتبة يدمج لاحقاً.

فحص `readelf -lW` للمكتبات المضيفة المرفقة في `node_modules/llama.rn/android/src/main/jniLibs` وجد LOAD alignment ‏`0x4000` في مكتبات arm64 وx86_64. هذه نقطة إيجابية تخص تلك الملفات فقط. ملفات HTP في `bin/arm64-v8a` رغم اسم المجلد هي ELF لـ Qualcomm DSP6 وليست مكتبات ARM64 المضيفة؛ لا أصنف محاذاتها ‏4KB عيب Android ‏16KB. `libOpenCL.so` المحلي ذو محاذاة ‏4KB stub يُستعمل في مسار build-from-source (`node_modules/llama.rn/android/src/main/CMakeLists.txt:117-127`)، وليس لدي مسار مثبت ينسخه إلى lib داخل APK الافتراضي؛ لا أزعم أنه عيب منشور. wrapper JNI وHermes والتغليف الكامل ما زالت غير متحققة.

أصول native في `llama.rn` تعتمد على lifecycle postinstall وشبكة تنزيل إضافية مع checksum. الموجود محلياً لا يثبت أن كل بيئة EAS ستنزله، لكنه أيضاً ليس تنزيلاً غير مثبت أو سبباً تلقائياً للفشل. إعدادات iOS entitlements تنتج فرقاً بين بعض عمليات prebuild المحلية وproduction بحسب البيئة؛ يحتاج الناتج الموقع للتحقق ولا يوجد دليل أن Apple رفضه. لا يوجد APK أو جهاز أو iOS archive مختبر في الأدلة المتاحة. لم أفحص حساب EAS أو Play Console أو شهادات التوقيع أو أسرار البيئة، ولم أجزم بموافقة المتاجر.

## إضافات ذات أولوية لهذا المجال

**P1 — شاشة قدرات وتشخيص أصلي قبل استيراد النموذج.** تعرض ABI للعملية، ووجود الوحدات، ونسخة build، وميزانية القرص والذاكرة، وسبب تعطيل GGUF/الخادم لكل منصة. تتطلب capability service موحداً وقياسات ذاكرة العملية لا الجهاز فقط. قيمتها تقليل الفشل المتأخر ودعم تشخيص جهاز المستخدم دون جمع مفاتيح أو محتوى محادثات.

**P1 — مسار إصدار موثق آلياً بالـ artifacts واختبارات أجهزة.** يربط commit بملف production وسجل الأدوات ونتائج smoke tests وفحص 16KB والـ manifest. يتطلب environment ثابتة وأجهزة/محاكيات مدعومة واختباراً بلا Metro. قيمته تحويل البناء من أمر منفصل إلى دليل تسليم قابل لإعادة التحقق.

**P2 — إعداد نموذج متكيف مع الجهاز.** يقترح حجم النموذج والسياق والدفعات والتسريع حسب metadata والذاكرة والمساحة، ويخفض الإعدادات بصورة معلنة. يتطلب فحص قدرة حقيقي وميزانية موارد وبيانات قياس على أجهزة، لا تخمين اسم النموذج. قيمته توسيع نطاق الأجهزة المستقرة دون وعود أن كل ملف تحت 16GiB يعمل.

**P2 — وضع جلسة موفر للطاقة بمدة واضحة.** يعرض ما إذا كان القفل محتجزاً ولماذا، ويوقف الخدمة عند الخمول أو انتهاء مهلة يختارها المستخدم، ويجعل pause توقفاً فعلياً للطاقة بعد انتهاء العمل. يتطلب إدارة موارد متسلسلة وإشارات حالة أصلية موثوقة. قيمته تقليل استنزاف البطارية مع بقاء الخدمة مفهومة وقابلة للتحكم.

## المراجع

[1]: https://docs.expo.dev/eas/json/ "Expo EAS JSON configuration reference"
[2]: https://docs.expo.dev/develop/development-builds/introduction/ "Expo introduction to development builds"
[3]: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.kernel.increased-memory-limit "Apple increased memory limit entitlement"
[4]: https://developer.apple.com/documentation/uikit/about-the-background-execution-sequence "Apple background execution sequence"
[5]: https://developer.android.com/google/play/vitals/excessive-wakelock "Android vitals excessive partial wake locks"
[6]: https://developer.android.com/guide/practices/page-sizes "Android support for 16 KB page sizes"
[7]: https://developer.android.com/develop/background-work/services/fgs/service-types "Android foreground service types and special use"
