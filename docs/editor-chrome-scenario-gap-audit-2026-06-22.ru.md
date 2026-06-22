# Chrome-аудит editor-сценария: недостающие интерфейсы и механики

Дата: 2026-06-22

URL: `http://localhost:3000/`

Проверка выполнена в Chrome по сценарию:

```txt
старт editor
-> создать/изменить skeleton
-> привязать SVG к костям
-> перекодировать SVG в path
-> создать animation clip/keyframes/events
-> настроить curves/transitions
-> проверить preview states
-> экспортировать source + compiled/runtime bundle
```

## 1. Короткий вывод

Текущий editor уже проходит большую часть пользовательского маршрута как рабочий vertical slice: режимы открываются, skeleton отображается, SVG-part можно выбрать и vectorize, timeline умеет создавать clip/track/key/event, keyframe можно двигать drag'ом, Curve и State Machine доступны, Preview проигрывает состояния, Export создает production bundle.

До production-ready authoring tool еще не хватает не одной кнопки, а набора надежных интерфейсов вокруг полного цикла:

- стабильный старт проекта без неявного dirty draft;
- строгая source-validity после каждого действия;
- graph-first State Machine editor;
- полноценный Rig/Shape canvas editing;
- зрелый Timeline/Curve dope sheet;
- batch/vectorization workflow для всех SVG;
- чистая диагностика export/runtime parity.

Главный найденный блокер: после timeline-операций в браузере появился app-specific `SchemaValidationError` при autosave:

```txt
$.animations[5].tracks[0].keyframes: Animation track must contain at least one keyframe.
```

Это означает, что UI сейчас может создать editor state, который не сериализуется в валидный source project. Для production-редактора это P0.

## 2. Что реально проверено в Chrome

| Шаг | Результат | Наблюдение |
| --- | --- | --- |
| Открыть editor | PASS | Страница `Bones Editor` открывается, canvas и панели не пустые. |
| Rig mode | PASS/PARTIAL | Selection, numeric transform, parent/root, mirror/facing работают; часть действий имеет слабую доступность/feedback. |
| Add Bone | PASS/PARTIAL | Команда работает через aria-name `Add bone`, но видимая кнопка `Add` не совпадает с accessible name. |
| Rename | PARTIAL | Команда выполняется, но нет достаточного подтверждения и impact preview. |
| Metadata | PARTIAL | `Mirror ID`/`Facing` кликаются; `Tag` неоднозначен из-за дублирующихся кнопок. |
| Shape mode | PASS | Parts list виден, `bodyShape` выбирается. |
| Vectorize | PASS | `bodyShape` успешно переводится из SVG в path-представление. |
| Timeline | PASS/PARTIAL | Clip/track/key/event создаются, keyframe drag работает. |
| Curve | PASS/PARTIAL | Curve panel и batch controls есть, но graph editing еще недостаточно зрелый. |
| State Machine | PASS/PARTIAL | Graph виден, Preview Transition кликается; authoring все еще inspector-heavy. |
| Preview | PASS | `idle`, `walk`, `run`, `jump`, `fall`, `land` кликаются. |
| Export | PASS | Создается 7 файлов, включая manifest/gzip. |
| Console health | FAIL | Есть extension noise и один реальный app error autosave/source validation. |

## 3. Несовпадения с исходным сценарием

### 3.1. Старт проекта не гарантированно чистый

Сценарий говорит, что проект стартует из `initialEditorProject`. В браузере текущая сессия открылась с уже dirty/local draft состоянием: были видны следы предыдущих тестовых сущностей и текущих настроек.

Что нужно доработать:

- стартовый экран или banner: `Sample`, `Draft`, `Imported Source`;
- явная команда `Reset to clean sample`;
- команда `New empty project`;
- команда `Load Shadow Hero sample`;
- предупреждение перед применением local draft;
- smoke-проверка, что pristine session действительно совпадает с `initialEditorProject`.

Успех:

- пользователь всегда понимает, редактирует он sample, local draft или импортированный source;
- scenario test может стартовать с чистого deterministic state без ручной очистки localStorage.

### 3.2. Пример уже не содержит cloak

Сценарий упоминает `cloak` и `cloakShape`. В текущем Chrome-проходе hierarchy и parts list уже не показывали cloak, что соответствует более позднему требованию убрать cloak из примера.

Что нужно доработать:

- обновить scenario/docs/sample description;
- закрепить sample fixture test, который проверяет expected bones/parts;
- явно показывать sample version в Project panel.

Успех:

- документация, UI sample и экспортируемый source описывают один и тот же набор bones/parts.

### 3.3. Export bundle уже шире старого сценария

Сценарий ожидает 5 файлов:

- `hero.source.rig.json`;
- `hero.rig.json`;
- `hero.animations.json`;
- `hero.state-machine.json`;
- `hero.compiled.json`.

Фактически Export в Chrome показал 7 files ready, включая release manifest и gzip artifact. Это правильное движение к production packaging, но UI и docs должны объяснять результат.

Что нужно доработать:

- обновить export documentation;
- в Export panel показать группы: source, runtime compact, compressed package, manifest;
- отдельно показывать "runtime-compact JSON" и "gzip/brotli compressed artifact";
- добавить checksum/version/schema profile в manifest UI.

Успех:

- пользователь понимает, какой файл нужен editor import, какой runtime load, какой CDN/release delivery.

## 4. P0-блокеры

### P0.1. Editor может создать source-invalid animation state

В консоли был app-specific error:

```txt
SchemaValidationError:
$.animations[5].tracks[0].keyframes:
Animation track must contain at least one keyframe.
```

Вероятная причина: UI допускает создание clip/track без keyframes, а autosave/source serialization сразу прогоняет это через schema validator, где `keyframes` имеет `minItems: 1`.

Что нужно доработать:

- не сериализовать empty tracks в canonical source;
- либо создавать track и первый keyframe атомарно;
- либо хранить empty authoring track только как editor draft metadata, не как `RigProject`;
- показывать inline warning в Timeline вместо console error;
- запретить autosave invalid source без явного draft envelope;
- добавить regression test на создание clip/track до первого keyframe.

Технический промт:

```txt
Почини Timeline/source serialization так, чтобы editor никогда не сохранял invalid RigProject при создании нового clip/track.

Фокус:
- apps/editor/app/editorState.ts
- apps/editor/app/editorSourceProject.ts
- apps/editor/app/projectIo.ts
- packages/schema/src/validate.ts
- apps/editor/tests/*

Требования:
1. Empty timeline tracks не должны попадать в canonical RigProject.
2. Add Track должен либо создавать первый keyframe, либо оставаться editor-only draft до Add Key.
3. saveDraft не должен падать SchemaValidationError в консоль.
4. UI должен показывать понятный warning, если есть draft track без keyframes.
5. Добавь тест: create clip -> add track -> autosave/serialize не падает.
```

Проверка:

- создать новый clip;
- нажать `Add Track`;
- не добавлять keyframe;
- дождаться autosave;
- в console нет app-specific error;
- Export либо не включает empty track, либо блокируется понятной UI-ошибкой.

Успех:

- после любых timeline authoring steps `toSourceProject()` не ломает autosave;
- invalid draft state не попадает в production export.

### P0.2. Нет надежной модели "чистый sample vs local draft"

Текущий editor открывает сохраненное dirty состояние без явного контроля пользователя. Для продакшн-инструмента это риск: сценарий "с нуля" становится недетерминированным.

Технический промт:

```txt
Добавь в editor явное управление состоянием проекта: clean sample, empty project, imported source, local draft.

Требования:
1. Project panel показывает source kind и draft age.
2. При наличии local draft показывается banner с действиями: Continue Draft, Reset to Sample, New Empty.
3. Reset to Sample очищает local draft и загружает current sample fixture.
4. New Empty создает минимальный root-only project.
5. Browser smoke может запускаться с query param или localStorage reset для deterministic scenario.
```

Проверка:

- открыть editor с dirty local draft;
- увидеть banner;
- выбрать Reset to Sample;
- reload;
- получить ожидаемый sample без тестовых сущностей;
- выбрать New Empty и создать root/body/head вручную.

Успех:

- сценарий "с нуля" воспроизводим;
- пользователь не редактирует старый draft случайно.

## 5. P1-доработки интерфейсов и механик

### P1.1. Rig Mode: production authoring, а не набор кнопок

Что уже работает:

- выбор кости в hierarchy;
- `Add Bone`;
- rename-команда;
- числовой transform edit;
- `Parent Root`;
- mirror/facing metadata.

Чего не хватает:

- canvas drag для head/tail/pivot;
- rotate handle;
- reparent через hierarchy/canvas;
- safe rename/delete с impact preview;
- unique scoped action labels;
- видимый selection/commit feedback;
- auto-key transform changes на текущем времени timeline;
- lock/hidden/tag metadata без неоднозначных кнопок.

Технический промт:

```txt
Доработай Rig Mode до полноценного skeleton authoring.

Требования:
1. Bone handles на canvas: head, tail, pivot, rotation ring.
2. Drag head меняет local x/y; drag tail меняет length/rotation.
3. Reparent через hierarchy drag/drop и inspector parent picker.
4. Rename/Delete показывают impact preview: children, bound parts, animation tracks, procedural refs.
5. Все кнопки имеют уникальные accessible names: Rig Add Bone, Rig Tag Bone, Rig Rename Bone.
6. При включенном Auto-key изменение bone transform пишет keyframe на текущем timeline time.
7. Все операции undoable и отражаются в History.
```

Проверка:

- создать дочернюю кость от `body`;
- перетащить head/tail на canvas;
- reparent к `root`, затем обратно к `body`;
- переименовать и проверить update refs;
- включить Auto-key и сдвинуть кость на `0.5s`;
- увидеть keyframe в timeline и source export.

Успех:

- skeleton можно собрать и корректировать без ручного JSON;
- animation authoring напрямую связан с rig edit.

### P1.2. Accessibility и однозначность команд

Проблема:

- видимая кнопка `Add` имеет accessible name `Add bone`;
- кнопка `Tag` встречается больше одного раза;
- автоматизированный сценарий ломается на unscoped controls.

Технический промт:

```txt
Приведи editor controls к production accessibility contract.

Требования:
1. Все action buttons получают уникальный aria-label с названием панели.
2. Visible text и aria-label не конфликтуют.
3. Дублирующиеся кнопки получают scope: Rig Tag Bone, Shape Tag Part, Timeline Add Key.
4. Добавь Playwright/browser smoke, который кликает сценарий по role/name без координат.
5. Для icon-only controls добавить title/aria-label.
```

Проверка:

- `getByRole('button', { name: ... })` находит ровно один control для каждого шага;
- scenario smoke не использует координаты для основных действий.

Успех:

- интерфейс тестируем и доступен;
- automation сценарии не ломаются на одинаковых названиях кнопок.

### P1.3. Shape/SVG authoring и batch vectorize

Что уже работает:

- parts list виден;
- SVG-part выбирается;
- `Vectorize` переводит selected SVG в path.

Чего не хватает:

- batch vectorize всех SVG;
- счетчик `N SVG remaining`;
- SVG import/paste/file picker;
- bind/unbind part -> bone;
- pivot/viewBox controls;
- preview diff до/после vectorize;
- поддержка групп/масок/compound paths или понятная диагностика ограничения.

Технический промт:

```txt
Доработай Shape panel для полного SVG -> path workflow.

Требования:
1. Parts table: id, type, bone, draw order, visibility, asset/source status.
2. Batch Vectorize All SVG.
3. После vectorize показать commands/points count и visual diff warning.
4. SVG import supports file, paste, assetPath.
5. Bind to Bone control меняет boneId с сохранением local transform.
6. Importer diagnostics показывает unsupported SVG features: groups, masks, gradients, symbols.
```

Проверка:

- импортировать SVG;
- привязать к `head`;
- vectorize selected;
- batch-vectorize остальные SVG;
- export source/compiled без `type: "svg"`.

Успех:

- production export не зависит от ручного перебора parts;
- пользователь понимает качество и ограничения vectorization.

### P1.4. Path editor

Проблема:

Vectorize есть, но полноценное редактирование path после импорта еще недостаточно для production authoring.

Что нужно:

- point/handle selection;
- Bezier handles;
- insert/delete point;
- close/open contour;
- multi-select;
- snap;
- local pivot;
- mirror path;
- undo per edit;
- visual command list.

Технический промт:

```txt
Реализуй production path editing поверх vectorized parts.

Требования:
1. Canvas handles для M/L/Q/C/Z commands.
2. Drag anchors/handles меняет path commands.
3. Insert point on segment, delete selected point, close/open path.
4. Multi-select points and move group.
5. Snap to grid/bone/pivot.
6. Undo/redo для каждой операции.
7. Path inspector показывает command list and selected command data.
```

Проверка:

- vectorize `bodyShape`;
- передвинуть anchor;
- добавить point;
- отредактировать cubic/quadratic handle;
- export/import roundtrip сохраняет path.

Успех:

- после SVG import пользователь может реально исправить форму в editor.

### P1.5. Timeline: dope sheet, drag, auto-key, event payloads

Что уже работает:

- create clip;
- add track;
- add key at time;
- add event buttons;
- keyframe drag;
- time/key value inputs.

Проблемы:

- selected target/property может остаться от прошлой сессии;
- можно случайно писать keyframes не в тот bone/property;
- event lane есть, но payload editor недостаточен;
- нет полноценного range/multi-key/lasso editing;
- snap/zoom/scale нуждаются в явном управлении;
- empty track может ломать source validation.

Технический промт:

```txt
Доработай Timeline до production dope sheet.

Требования:
1. New Clip wizard сбрасывает target/property/time в безопасное состояние.
2. Active target/property всегда явно видны рядом с Add Key.
3. Empty tracks не попадают в source export.
4. Drag keyframes поддерживает snap, multi-select, range move, alt-duplicate.
5. Drag на canvas при выбранном time и Auto-key пишет bone transform keys.
6. Events имеют inspector: type, time, payload, marker color, preview trigger.
7. Timeline zoom/pan не ломает layout нижней панели.
8. Undo/redo сохраняет selected keys/time.
```

Проверка:

- создать `walk`;
- добавить tracks `body.scaleY`, `head.y`, `thighFront.rotation`;
- multi-select keys и сдвинуть на `+0.1s`;
- добавить footstep event с payload;
- drag bone на canvas при `0.5s`;
- export/import проверить tracks/events.

Успех:

- анимацию walk/jump можно собрать без ручного JSON и без потери target context.

### P1.6. Curve editor

Что уже работает:

- Curve tab открывается;
- есть sampled graph/ticks;
- batch preset доступен при выбранном key.

Чего не хватает:

- draggable bezier handles;
- velocity/tangent controls;
- value-axis editing;
- per-key interpolation preview;
- compare before/after transition curves;
- spring parameter visualization.

Технический промт:

```txt
Доработай Curve editor как полноценный graph editor.

Требования:
1. Выбранный timeline key открывает curve segment.
2. Bezier handles можно двигать drag'ом.
3. Linear/step/hold/bezier/spring меняются без потери key data.
4. Graph показывает sampled result для selected track.
5. Value-axis drag меняет keyframe value.
6. Batch preset применим к выделенной группе keys.
```

Проверка:

- выбрать key `body.scaleY`;
- поменять interpolation на bezier;
- drag handle;
- увидеть изменение sampled curve;
- export/import сохраняет curve.

Успех:

- пользователь может настраивать motion quality визуально, а не только через dropdown.

### P1.7. State Machine: graph-first transitions

Что уже работает:

- State Machine tab открывается;
- graph виден;
- Preview Transition кликается.

Чего не хватает:

- создание transition drag'ом между nodes;
- inline labels duration/easing/condition;
- validation условий;
- any-state/global transitions;
- interrupt/canExit/syncMode controls;
- live parameter panel;
- transition blend preview with transform interpolation;
- event hooks enter/exit/transition.

Технический промт:

```txt
Доработай State Machine editor до graph-first workflow.

Требования:
1. Nodes можно двигать и сохранять layout.
2. Drag from state output to state input создает transition.
3. Transition edge показывает duration, easing, condition summary, priority.
4. Condition editor валидирует params and operators.
5. Поддержать any-state/global transitions and canInterrupt.
6. Live preview: changing parameters triggers actual transition in editor preview.
7. Transition blend preview показывает transform/opacity/deform interpolation.
8. Export/import сохраняет graph layout как editor metadata.
```

Проверка:

- создать states `idle`, `walk`, `jump`, `fall`, `land`;
- создать transitions graph drag'ом;
- задать condition `speed > 0.1`, `grounded == false`;
- проиграть live preview с изменением params;
- экспортировать и загрузить compiled в runtime preview.

Успех:

- бесшовная смена состояний создается и проверяется в editor без ручного JSON.

### P1.8. Preview/runtime parity

Preview сейчас показывает состояния, но production-ready проверка должна доказывать, что editor preview и compiled runtime дают один результат.

Технический промт:

```txt
Добавь runtime parity preview для compiled bundle.

Требования:
1. Preview имеет режим Editor Source и Compiled Runtime.
2. После Export можно загрузить compiled JSON обратно в preview.
3. Для states idle/walk/run/jump/fall/land сравниваются sampled transforms.
4. Показать warnings при расхождении source preview и compiled runtime.
5. Добавить browser visual smoke с pixel/frame evidence для основных transitions.
```

Проверка:

- export bundle;
- load compiled in preview;
- проиграть `idle -> walk -> jump -> fall -> land -> idle`;
- увидеть отсутствие warnings;
- сохранить smoke result.

Успех:

- editor доказывает, что production runtime воспроизводит authored animation.

## 6. P2-доработки production качества

### P2.1. Console/test hygiene

В Chrome есть шум от расширений, но app errors должны отделяться и падать в smoke.

Технический промт:

```txt
Добавь browser smoke console classifier.

Требования:
1. Игнорировать known extension noise по chrome-extension urls.
2. App-specific error/warn из localhost/webpack-internal считать failure.
3. Сохранять console summary в docs/editor-browser-visual-smoke.ru.md или test artifact.
4. Проверять отсутствие SchemaValidationError после authoring сценария.
```

Проверка:

- запустить scenario smoke;
- extension warnings не фейлят тест;
- app SchemaValidationError фейлит тест.

Успех:

- browser smoke ловит реальные regressions и не шумит из-за расширений.

### P2.2. Visual regression для layout и resize panels

Нижняя timeline panel и resize уже улучшались, но нужны gates.

Технический промт:

```txt
Добавь visual regression smoke для editor layout.

Проверки:
1. Desktop 1440x900: левая/правая/нижняя панели видны.
2. Timeline expanded: canvas сохраняет aspect ratio персонажа.
3. Timeline collapsed: controls не налезают.
4. Right inspector scroll работает.
5. No text overlap in toolbar/timeline controls.
```

Успех:

- изменение панелей не ломает персонажа и timeline controls.

### P2.3. Production export UX

Export работает, но должен быть понятен как release pipeline.

Технический промт:

```txt
Доработай Export panel как production release builder.

Требования:
1. Показать file groups: source, split source, compiled, compressed, manifest.
2. Указать schema version, compiler version, content hash.
3. Вывести warnings: remaining SVG, unsupported SVG features, empty draft tracks, state machine unreachable states.
4. Добавить Download All / Copy Manifest / Copy Runtime JSON.
5. Для gzip/brotli показать original/compressed size.
```

Проверка:

- export clean sample;
- увидеть 0 blockers;
- увидеть 7 artifacts с назначением;
- compiled не содержит editor metadata/SVG.

Успех:

- export panel можно использовать как production release checklist.

## 7. Итоговый список интерфейсов, которых не хватает

1. Project start/reset/import screen.
2. Clean sample vs local draft banner.
3. Empty project wizard.
4. Rig canvas handles: head/tail/pivot/rotate.
5. Rig safe rename/delete impact modal.
6. Rig hierarchy drag/drop reparent.
7. Unique accessible action names across all panels.
8. Parts table with bind/unbind controls.
9. SVG import/paste/file picker.
10. Batch Vectorize All SVG.
11. SVG unsupported-feature diagnostics.
12. Production path editor with anchors/handles.
13. Timeline new clip wizard.
14. Timeline empty-track-safe source serialization.
15. Timeline multi-key/range/lasso editing.
16. Timeline event payload inspector.
17. Auto-key from canvas bone/part drag at current time.
18. Curve graph editor with draggable handles.
19. State Machine graph-first creation/editing.
20. Live state parameters and transition debug.
21. Compiled runtime parity preview.
22. Browser visual regression for layout/resizing.
23. Console classifier for app vs extension errors.
24. Export release manifest UX with compression details.

## 8. Приоритет выполнения

1. P0.1: source-invalid empty tracks/autosave.
2. P0.2: deterministic project start/reset/sample.
3. P1.2: accessibility/unique command names for reliable browser automation.
4. P1.5: Timeline dope sheet + auto-key + event payloads.
5. P1.1: Rig canvas handles and safe rig operations.
6. P1.3/P1.4: Shape vectorization and path editor.
7. P1.6: Curve graph editor.
8. P1.7: State Machine graph-first transitions.
9. P1.8: compiled runtime parity preview.
10. P2.1-P2.3: smoke/visual/export production gates.

## 9. Definition of Done для полного сценария

Сценарий считается production-ready, когда в Chrome без ручного JSON можно:

1. начать с clean sample или empty project;
2. создать skeleton из root/body/head/arms/legs;
3. импортировать SVG parts и привязать к bones;
4. vectorize все SVG в path;
5. поправить path points/handles;
6. создать clips `idle`, `walk`, `run`, `jump`, `fall`, `land`;
7. настроить keyframes, curves, events;
8. создать state machine с условиями и transition blending;
9. проверить seamless transitions в Preview;
10. экспортировать source + compiled + compressed release;
11. загрузить compiled обратно в runtime preview;
12. получить чистую console без app errors;
13. пройти browser visual smoke без overlap/aspect-ratio regressions.
