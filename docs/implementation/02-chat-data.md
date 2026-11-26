# 02-chat-data — المحادثات والخصوصية وملكية الطلب والإعدادات

## حالة التسليم

**completed-with-validation-gaps؛ جاهز لحفظ المنسق.** أُنجزت عقود المرحلة الثانية في المصدر مع اختبارات تستورد وحدات الإنتاج والمكوّنات الفعلية، لا ادعاء اعتماد Android. أساس المرحلة السابقة المثبت هو `f800747990d0263be55a484177a93d391ad03ff1` على `main`. تغييرات هذه المرحلة متعمدة وغير ملتزمة بعد؛ `containing-commit` في السجل هو الالتزام الذي سيحفظه المنسق. لم ينفذ هذا العامل checkpoint أو Git add/commit/push ولم يستكشف أداة checkpoint؛ الحفظ والمزامنة من مسؤولية الأب. تقارير التدقيق الأصلية لم تتغير.

المنتج المقصود **Expo SDK 57 ببناء Android أصلي، وليس Expo Go**. لا APK جديد ولا اختبار هاتف أو emulator أو نشر API أو إثبات تشغيل CI بعيد في هذه المرحلة. لا توجد عقبة تمنع تسليم المصدر المتماسك؛ فجوات التنفيذ الأصلي وميزات المراحل الأخرى ليست مانع checkpoint.

## ما تغير بالفعل

### مصدر الحالة والاحتفاظ

`src/chat/chat-data.ts` يعرّف المخططات والمخفض والافتراضات. `ChatStore.byId` مصدر الحقيقة الوحيد، و`currentId` معرف اختيار؛ المحادثة الحالية والقائمة مشتقتان في `lib/chat-context.tsx`. تعديل الرد أو تقييمه أو عنوانه لا يحدث في نسخة مستقلة. UUIDs تأتي من `expo-crypto` في الإنتاج. الترتيب مركزي: المثبت أولًا ثم `updatedAt`؛ البحث والمفضلة والأرشفة متاحة عبر selector والـdrawer.

`ChatRepository` يستعيد الغلاف الإصدار 2 قبل السماح بالحفظ، ويسلسل عمليات التخزين. إصدارات غير معروفة وJSON غير صالح لا تُستبدل بقائمة فارغة. فحص المخطط يشمل الأزمنة ونسخ الرد والمعرّفات المكررة للرسائل والمحادثات والفروع وحدود الأطوال والأعداد. عند salvage تبقى النسخة الأصلية؛ الحفظ فوق غلاف v2 تالف يرفض بدلاً من محو الأجزاء المعزولة تلقائيًا.

`gassar_save_history=false` حاجز متزامن قبل انتظار التخزين، ويشمل جميع مسارات الكتابة الاعتيادية: إنشاء/إرسال/تجديد/تقييم/تسمية/تثبيت/مفضلة/فروع. المحادثات الحالية تصبح `temporary` عند تعطيله، ولا تُحفظ تعديلات الفترة الخاصة بأثر رجعي عند إعادة تفعيله. المحادثة الدائمة القديمة تبقى على القرص بلقطتها السابقة؛ المحادثات الجديدة بعد التفعيل تحفظ منفصلة. فشل كتابة السياسة يبقي الحفظ معطلاً بأمان في الجلسة، حتى بعد تبديل الهوية. الحذف والمسح إجراءات صريحة مستقلة عن سياسة الحفظ، مع انتظار التخزين وإظهار الخطأ؛ لا يمسح إطفاء الحفظ تاريخًا قديمًا تلقائيًا.

### الهوية والترحيل والحذف

`namespaceFor` يدعم `guest` و`local:<encoded id>` و`verified:<encoded id>`. خدمة الحساب الحالية تُصدر **local** فقط؛ هذا ليس إصلاح المصادقة SHA/OAuth ولا تحويلها إلى هوية موثقة. BE-01 وBE-03..08 تظل للمرحلة 08.

مفاتيح البيانات `gassar_data_v2:<namespace>` وإعدادات النموذج `gassar_model_settings_v2:<namespace>:<encoded model id>`. سجل `conversations` القديم بلا مالك قابل للإثبات ينسخ إلى الضيف فقط وبصورة إضافية؛ يبقى الأصل ولا يُسند إلى حساب مسجل. `conversationHistory` الخاص بـGemini القديم يحتفظ به كبيانات استرداد غير مرتبطة، ولا يدخل منشئ الطلب الجديد. حذف محادثة ضيف مفردة يزيل نسخة تلك المحادثة من السجل القديم **ولا يمحو سجل Gemini غير المنسوب بأكمله**؛ المسح الشامل المؤكد للضيف يزيل المفتاحين. إغلاق UI-01 جزئي لهذا السبب الآمن، إلى أن يوفر مركز البيانات قرار استرداد/مسح واضحًا لهذا السجل القديم.

تبديل الهوية يمسح الحالة المرئية والمسودات ويزيد epoch ويجهض ملكية الطلب القديم. إعدادات القراءة والحفظ تلتقط namespace **قبل** انتظار تفعيل النموذج أو التخزين؛ نتائج A المتأخرة لا تعدل إعدادات B. حذف الحساب يلتقط A مرة واحدة، ينصب tombstones في صف مستودع المحادثة وصف إعدادات النموذج، ثم ينتظر الكتابات الجارية ويحذف نطاقه. إذا دخل B أثناء الانتظار لا يتبع الحذف `currentUser` إليه ولا يسجل خروجه. جلسة الحساب تنشر الهوية بعد نجاح الكتابة فقط؛ الخروج يخفي الحساب فورًا حتى عند خطأ التخزين. تبقى بيانات حساب آخر والضيف والأصول القديمة غير المملوكة محفوظة.

### إرسال وتوليد وملكية النتيجة

`ChatController` يقبل عملية واحدة متزامنًا قبل أول await. الطلب يحمل `requestId + conversationId + epoch + AbortController`. فتح B أثناء طلب A لا ينقل الرد أو فشل A إلى B. حذف A أو تبديل الهوية يهمل النتيجة المتأخرة، بما فيه تبديل الهوية أثناء انتظار الحفظ النهائي. الإلغاء لا يدعي توقف المحرك: admission lock يبقى إلى أن يستقر Promise القديم، حتى إن تجاهلت الخدمة signal. القفل هذا خاص بالدردشة؛ ليس بعد mutex عامًا لجميع استدعاءات GGUF والخادم.

`sendMessage`, `retryMessage`, `regenerateResponse`, `editUserMessage` تعيد `SendResult`:

- `complete`: `accepted:true`, `requestId`, `conversationId`, `userMessageId`, و`message` الفعلية.
- `refused | failed | cancelled`: `accepted`, `reason`، ومعرّفات العملية والسؤال عندما تكون متاحة.

المستدعي لا يمحو المسودة إلا بعد `accepted:true`. الفشل قبل قبول السؤال يبقي النص والمرفقات؛ الفشل بعده يبقي سؤالًا بحالة `failed/cancelled` وزر إعادة محاولة يستخدم نفس السؤال مرة واحدة. المسودة الأولى تراجع في شاشة الدردشة ثم ترسل صراحة، وليس إرسالًا تلقائيًا من URL. `app/voice/index.tsx` يستهلك الرسالة الناتجة الفعلية، ولا يعرض «تم الإرسال» بناءً على Promise resolved فقط. لا يشكل ذلك تنفيذ جلسة TTS/STT نصف مزدوجة كاملة.

منشئ واحد `buildRequest` يحل `auto` بصورة متطابقة لكل العمليات؛ نموذج محلي يبقى محليًا ولا يتحول تلقائيًا إلى Gemini. `online + local` يرفض ويطلب اختيارًا واضحًا. history ينتهي قبل السؤال الهدف؛ السؤال يضاف مرة واحدة. يُحفظ `AttachmentSnapshot {version:1,context,inline}` في السؤال ويعاد استخدامه للتجديد والتاريخ. المحلي النصي يرفض إسقاط مصدر inline، والمزود غير الداعم للملف الأصلي يرفض بدلاً من تجاهله. تعديلات cloud adapter محدودة بحمل المرفقات التاريخية وsignal؛ اختبارات النقل الأربعة تستعمل fetch بديلًا فقط.

### الفروع والواجهة والإعدادات

تحرير سؤال قديم أو تجديد رد قديم يحفظ الرسائل والذيل الأصلي كفرع ثم يقطع الذيل المتناقض. التجديد يضيف نسخة رد مع `activeVersion`؛ التقييمات والنسخ تحفظ. تبديل نسخة رد يحفظ الفرع السابق ويقطع الرسائل اللاحقة، و`restoreBranch` يحفظ الفرع الحالي قبل الاستعادة. الحدود ترفض فرعًا/نسخة جديدة بدل حذف فروع قديمة تلقائيًا.

معرف حوار التسمية مستقل عن قائمة الخيارات؛ أخطاء updateMessage/regenerate/retry/toggle/rename/share/نسخ تستوعب في المستدعين المعدلين. loading الكبير ومؤشر زر الإرسال يظهران فقط عند `pending.conversationId === route id`، لكن pending العام يبقي ضوابط التوليد معطلة. `generationDisabled` يصل إلى `AssistantMessageActions`. الاستعادة المتأخرة تتيح اختيار deep link بعد hydration؛ مسودة الشاشة ونتائج async المحلية تُعزل بحسب route/namespace.

`DEFAULT_MODEL_SETTINGS` و`modelSettingsSchema` المصدر المركزي للقيم. الشاشة تقرأ context وتستدعي `updateModelSettings` مع dependencies كاملة، وإعادة التعيين تستخدم نفس الافتراضات المركزية ولا تعلن نجاحًا عند الرفض. تخزين per-model يسلسل القراءة والكتابة، يرفض الأخطاء، ويقرأ الافتراض القديم للضيف فقط. القيم الأساسية تصل فورًا إلى الإرسال والتجديد المحلي والسحابي. **minP/xtcThreshold/typicalP/penaltyRepeat/penaltyLastN معطلة عمدًا في الشاشة إلى أن تربطها المرحلة 03 بالمحرك وتتحقق من دعمها**؛ لذلك UI-06 وML-04 جزئيان، لا ادعاء تطبيق sampler متقدم.

### مسودات ونسخ احتياطية

`lib/chat-drafts.ts`: معرفات عشوائية في الذاكرة فقط، 50 مسودة وTTL 30 دقيقة، نسخ دفاعية للمرفقات، إزالة عند قبول السؤال ومسح عند تبديل الهوية. `chatDraftRoute` يحمل معرف المحادثة و`draftId` فقط، دون نص أو JSON مرفقات في URL. الانتقال من الرئيسية/الصوت لا يفقد نسخة النص الأصلية إذا تعذر التنقل. لا تُحفظ المسودات على القرص.

`exportBackup/parseBackup/previewBackup` في `src/chat/backup.ts` أدوات بدائية فعلية: format=`gassar-chat-backup`, backup version=1, data version=2, scope=`conversations-and-model-settings`، حد إجمالي **64 MiB ببايتات UTF-8**. allowlist تشمل المحادثات والفروع والتقييمات والنسخ والإعدادات وsnapshots فقط؛ تستبعد sessions/tokens/API keys وحقول File/metadata العشوائية، حتى في الكائنات المتداخلة. معاينة تعطي الأعداد الحقيقية وتحذر `snapshots-only-external-uri-not-portable`.

`importData`/`importBackup` يرفضان أثناء التوليد أو قبل hydration أو مع تعطيل الحفظ. `merge` يبقي المحادثة والإعدادات الحالية عند تضارب ID ويضيف IDs جديدة؛ `replace` يستبدل هذا النطاق فقط بعد نجاح الحفظ. المخطط ينظف البيانات قبل عرضها، وتحديث إعدادات النموذج النشط فوري. فشل التخزين لا يستبدل state. **لا شاشة Data Center ولا أرشيف ملفات ولا تشفير بكلمة مرور ولا checksum بعد**؛ واجهة التأكيد والمعاينة وملكية الملفات للمراحل 04/09. export يتضمن البيانات الموجودة في الذاكرة، ومنها temporary إن استدعاه المستخدم صراحة؛ واجهة المرحلة 09 يجب أن تحذر وتطلب الموافقة قبل تصدير جلسة خاصة.

## التحقق المنفذ

الأوامر نفذت صراحة داخل `/home/ubuntu/gassar-ai`، بلا قراءة أسرار/.env، ولا طلب نموذج مدفوع/حي أو حساب API أو تعديل قاعدة خارجية:

| الفحص | النتيجة |
|---|---|
| `pnpm check` | TypeScript ناجح، صفر أخطاء |
| `pnpm exec vitest run tests/chat-data.test.ts tests/chat-stage02-contracts.test.ts tests/chat-stage02-ui.test.ts tests/cloud-model-service.test.ts` | **59 ناجحة في 4 ملفات**: 27 +19 +6 +7 |
| `pnpm test` | **152 ناجحة، 1 auth قديم متخطى**؛ 15 ملف ناجح و1 متخطى |
| `pnpm test:sync` | **40 Python ناجحة** في مستودعات اختبار مؤقتة ونقل بديل؛ ليست SHA/مزامنة المشروع الحية |
| `pnpm lint` | **0 أخطاء، 27 تحذيرًا**؛ لا تحذير callbacks شاشة ضبط النموذج |
| `git diff --check` | ناجح |
| مقارنة `docs/audits` مع HEAD | لا تعديل |

اختبارات المكوّنات تستورد `ChatScreen` و`ModelSettingsScreen` وتضغط callbacks بشجرة React مع hooks/native mocks محدودة؛ تثبت wiring ومعالجة الرفض والتحميل بحسب route وافتراضات reset. **ليست render/e2e/وصول أو لوحة مفاتيح على هاتف.** اختبارات backup/settings/auth/repository/controller تستدعي المصدر الحقيقي بمواعيد storage/network مؤجلة، ولا تعتمد على كائن synthetic يغني عن استدعاء الإنتاج. suite القديمة ما زالت تحتوي اختبارات إنشائية خارج نطاق هذه المرحلة وauth خلفي متخطى؛ BE-11 لا يُغلق إجمالًا.

## التسليم للمراحل التالية والحدود الدقيقة

1. **03-gguf** يملك manager/runtime/mutex ونقل النتيجة typed وonToken/tokenize/backend/usage/finish/cancel. عدّل `ChatDependencies.generate` وadapter في `lib/chat-context.tsx` مع الحفاظ على SendResult وملكية request/conversation. التوقف الحالي يحجب النتائج ولكنه لا يثبت توقف native. لا تبدّل contexts أثناء completion أو تخلط قفل الخادم مع قفل الشاشة.
2. **03/04/05** يملكون token budgets الفعلية: history الحالي آخر **12 رسالة**، وليس ميزانية توكنات. حدود snapshot/backup ليست فحص ذاكرة هاتف أو سياق نموذج. مطلوب input+system+history+source+output reserve، وسلوك trimming/partial واضح. CLD-07 يبقى جزئيًا رغم إصلاح تكرار السؤال.
3. **04-documents-rag** يستبدل `AttachmentReader` بتخطيط محتوى حقيقي/IDs ثابتة/حجم فعلي ومجموع/signature/platform readers/source ownership. قارئ attachment الحالي ما زال يستخدم الاسم والـURI المؤقت ومحدودية النص القديمة؛ لا PDF parser/OCR/RAG ولا ضمان عمر cache/Blob. ميزانيات preflight الحالية تعتمد metadata (TXT 5 MiB، inline 20 MiB)، ولا تثبت قراءة كاملة أو أمان ذاكرة. لا تحذف originals أو ملفات اختيار المستخدم؛ حذف app-owned copies فقط بعد تتبع المراجع وموافقة المستخدم. ATT-05 وUI-12 جزئيان، ATT-01..04/07..10 ما زالت متطلبات المرحلة 04.
4. **05-cloud** يملك المهلة/retries/SSE/secure web keys/تنقيح Gemini URL/الكتالوج/usage/finish وAnthropic. هذه المرحلة لم تنفذها ولم تستخدم مفاتيح حقيقية؛ لا يُفهم signal الممرر على أنه deadline أو streaming كامل. لا تعِد fallback محليًا/سحابيًا صامتًا.
5. **06-system-voice** يحتفظ بعقد send result والمسودة IDs، ويصلح singleflight/final transcript/results[0]/locale/TTS owner/default volume/rate/Android pause. تعديلات هذه المرحلة للانتقال والنتيجة فقط، لا اعتماد الصوت.
6. **08-backend-identity** يوحّد local/verified بعد إثبات الهوية دون إسناد legacy guest لمالك مفترض. حافظ على `subscribeIdentity` و`subscribeDataDeletion` أو انشر replacement دقيقًا؛ deletion callbacks تنصب fences قبل await. كلمات المرور المحلية SHA والـOAuth/JWT/logging القديمة لم تُعالج هنا.
7. **09-experience-data** يضيف UI المعاينة والتأكيد merge/replace، تصدير الملفات والتشفير الفعلي إن ادعى، القرار الآمن لسجل Gemini القديم، الترجمة/RTL/Markdown والوصول. ADD-02 وADD-09 جزئيان فقط؛ بقية الإضافات prerequisites وليست ميزات مغلقة.
8. **10-integration-release** يثبت APK/16KB/ABI/JSI/native-device/CI والcheckpoint وSHA البعيد. لا يساوي نجاح Vitest أو prebuild اعتماد Android.

## الملفات المملوكة للخطوة

المصدر والواجهات: `src/chat/{chat-data,chat-repository,request-builder,chat-controller,backup}.ts`؛ `lib/{chat-context.tsx,model-settings-storage.ts,chat-drafts.ts,auth-service.ts,cloud-model-service.ts}`؛ `app/(tabs)/index.tsx`، `app/auth/login.tsx`، `app/chat/[id].tsx`، `app/model-settings/index.tsx`، `app/settings/index.tsx`، `app/voice/index.tsx`؛ `components/{assistant-message-actions,sidebar-drawer,user-message-actions}.tsx`.

الاختبارات: `tests/chat-data.test.ts`، `tests/chat-stage02-contracts.test.ts`، `tests/chat-stage02-ui.test.ts`، `tests/cloud-model-service.test.ts`. التوثيق: هذا التقرير و`docs/IMPLEMENTATION_PROGRESS.md` و`docs/IMPLEMENTATION_STATUS.json`. لا تغييرات إلى الحزم أو Kotlin/GGUF/server/sync scripts أو تقارير التدقيق الأصلية في هذه المرحلة.
