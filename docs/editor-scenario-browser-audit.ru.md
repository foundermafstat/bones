# Аудит editor-сценария через Chrome

Дата: 2026-06-22

URL: `http://localhost:3000/`

Проверяемый сценарий:

```txt
открыть editor
-> создать/изменить skeleton
-> привязать SVG к костям
-> перекодировать SVG в path
-> создать animation clip/keyframes
-> настроить curves/transitions
-> экспортировать source JSON и compact runtime JSON
```

## Короткий вывод

Текущий интерфейс в Chrome показывает рабочий preview-shell: персонаж рендерится, hierarchy виден, режимы переключаются, Play/Pause работает, preview clip можно выбрать, часть команд меняет internal state.

Но полный сценарий производства персонажа с нуля пока **не проходит**. Главные блокеры:

1. Нет полноценного authoring UI для skeleton: команды есть, но они шаблонные и без ввода параметров.
2. Нет доступной команды `Vectorize` в реально запущенном UI, хотя SVG-part выбран.
3. Нет полноценного Shape/Path editor: нельзя редактировать Bezier points/handles.
4. Timeline/Curve/State Machine modes являются summary-представлениями, а не рабочими редакторами.
5. Export Bundle в запущенном UI отсутствует; `Copy JSON` копирует editor-wrapper, а не canonical source JSON.
6. Запущенный `localhost:3000` не совпадает с текущим исходником: в коде есть элементы, которых нет в браузере (`Vectorize`, `Parent Root`, `Export Bundle`, `Import Clipboard`).

## Среда проверки

- Browser: Chrome через расширение.
- Viewport: desktop, примерно `1430x756`.
- Page identity: `Bones Editor`, `http://localhost:3000/`.
- Framework overlay: не обнаружен.
- App blank state: не пустой, canvas и panels отрисованы.
- Console: app-specific ошибок не обнаружено; видны warnings/errors от Chrome extensions:
  - MetaMask/ObjectMultiplex warnings;
  - extension script `share-modal.js` error.

Эти console entries не выглядят ошибками приложения Bones.

## Что реально удалось пройти

### 1. Старт проекта

Результат: **частично работает**.

Наблюдения:

- Editor открывается.
- Отображается `Shadow Hero`.
- Есть `Hierarchy` с костями:
  - `root`;
  - `cloak`;
  - `body`;
  - `head`;
  - arms/legs bones;
  - `pelvis`;
  - feet.
- Canvas показывает силуэтного персонажа.
- Inspector показывает выбранную кость `body`.
- Shape summary показывает `bodyShape`, `type: svg`, asset `part_08_back_torso.svg`.

Проблемы:

- Это не "чистый start from scratch", а уже загруженный sample project.
- Нет команды `New Project`.
- Нет wizard/flow для создания пустого rig.
- Нет явного reset к `initialEditorProject` или очистки local draft.

Что нужно:

- `New Project`.
- `Load Sample`.
- `Reset Draft`.
- Диалог выбора starting template: empty rig / shadow hero sample / imported SVG rig.
- Явный статус: current source is sample/draft/imported.

### 2. Создать скелет

Результат: **частично работает как demo, не как production editor**.

Проверенные действия:

- `Rig -> Add Bone` создает новую кость.
- Новая кость появилась в hierarchy.
- Selection переключился на новую кость.
- `Rig -> Move` изменил `X` на `2`.
- `Rig -> Rotate` изменил rotation на `0.10`.
- `Rig -> Rename` переименовал кость в шаблонное имя.

Проблемы:

- `Add Bone` не спрашивает имя кости.
- `Rename` не открывает input/dialog, а применяет auto-name.
- `Move` всегда двигает на фиксированное значение.
- `Rotate` всегда поворачивает на фиксированное значение.
- Нет числовых editable inputs для transform.
- Inspector transform fields выглядят как read-only.
- Нет canvas handles для bone translate/rotate/pivot.
- Нет drag-and-drop parent change в hierarchy.
- Нет parent picker.
- Нет проверки bone id uniqueness через пользовательский ввод.
- Нет понятного удаления/undo path в видимой рабочей зоне.
- Кнопки metadata из текущего исходника (`Parent Root`, `Parent Body`, `Lock`, `Hide`, `Mirror ID`, `Tag`, `Facing`) в реально запущенном UI не видны.

Что нужно:

- Editable inspector inputs:
  - bone id;
  - display name;
  - parent;
  - local x/y;
  - rotation;
  - scale;
  - length;
  - tags;
  - mirrorGroup;
  - hidden/locked/facing.
- Context menu в hierarchy:
  - add child;
  - add sibling;
  - rename;
  - duplicate mirrored;
  - delete;
  - reparent.
- Canvas bone handles:
  - select;
  - drag pivot;
  - rotate handle;
  - show parent line;
  - snap/grid options.
- Undo/redo feedback:
  - visible command history;
  - disabled/enabled state;
  - last command label.

### 3. Прикрепить SVG к костям

Результат: **данные есть, интерфейс для создания/привязки почти отсутствует**.

Наблюдения:

- В inspector выбранный shape показывает:
  - `bodyShape`;
  - `type: svg`;
  - `asset: part_08_back_torso.svg`;
  - `points: 0`.
- Это подтверждает, что sample уже содержит SVG-part, привязанный к `body`.

Проблемы:

- Нет UI для добавления нового SVG asset.
- Нет file picker/import control.
- Нет drag-and-drop SVG на canvas.
- Нет visible part list отдельно от bone hierarchy.
- Нельзя выбрать конкретный part независимо от кости.
- Нельзя поменять `boneId` у part через UI.
- Нет bind/unbind interface для SVG -> bone.
- `Shape -> Bind` существует, но создает procedural part, не SVG binding flow.

Что нужно:

- `Parts` panel:
  - list of parts;
  - type badge: svg/path/procedural/mesh;
  - bound bone;
  - draw order;
  - visibility;
  - opacity;
  - asset source.
- `Import SVG` action:
  - file picker;
  - paste SVG;
  - URL/path import;
  - preview before bind.
- `Bind to Bone` control:
  - select bone dropdown;
  - bind/unbind;
  - preserve local transform;
  - set pivot from SVG viewBox/selection.

### 4. Перекодировать SVG в path

Результат: **не проходит в браузере**.

Ожидание сценария:

```txt
выбрать SVG-part
-> нажать Vectorize
-> type меняется svg -> path
-> points/pathCommands появляются в inspector
```

Фактическое поведение:

- В `Shape` mode выбранный part остается `type: svg`.
- `Shape` toolbar menu содержит:
  - `Bind`;
  - `Pen`;
  - `Mirror`;
  - `Pivot`.
- `Vectorize` в меню отсутствует.
- `Vectorize` не найден в body text/visible buttons после reload.
- `Points` остается `0`.

Отдельное замечание:

- В текущем исходнике `apps/editor/app/page.tsx` есть кнопка `Vectorize` в inspector и toolbar action.
- В запущенном `localhost:3000` этих элементов нет.
- Значит dev server/served bundle не совпадает с текущим рабочим деревом, либо UI code не доходит до runtime.

Что нужно:

- Вернуть/вывести видимую `Vectorize` команду для `type: svg`.
- После vectorize показывать:
  - old type;
  - new type;
  - number of paths;
  - number of commands;
  - number of editable points;
  - viewBox.
- Поддержать не только первый `<path>`, а минимум:
  - multiple paths;
  - grouped paths;
  - fill inheritance;
  - transform attributes;
  - simple compound paths.
- Добавить error UI:
  - SVG has no path;
  - unsupported SVG element;
  - fetch failed;
  - invalid path data.
- Добавить preview diff:
  - original SVG silhouette;
  - converted path silhouette.

### 5. Создать анимацию

Результат: **частично работает как preset commands**.

Проверенные действия:

- `Animate -> Add Key` добавил key.
- Inspector summary начал показывать `key3`.
- Dirty state изменился.
- `Animate -> Curve` изменил curve summary.
- `Animate -> Transition` добавил `walk->jump`.

Проблемы:

- Нет полноценного `Timeline Mode`.
- Режим `Timeline` только меняет label `Mode`, но не открывает отдельный editor.
- Нельзя создать новый clip через видимый UI.
- Нельзя выбрать active clip в timeline editor.
- Нельзя выбрать target bone/part/property для track.
- Нельзя задать keyframe time/value вручную.
- Нельзя drag keyframes на timeline.
- Нельзя выделить keyframe на timeline и редактировать в inspector.
- Нельзя включить auto-key как реальный workflow.
- Нет dope sheet grid с масштабом/scroll/selection.
- Timeline rows видны (`body.scaleY`, `head.y`, `thighFront.rotation`, etc.), но это скорее preview, чем editor.

Что нужно:

- `Clips` panel:
  - create/duplicate/delete clip;
  - duration;
  - loop;
  - fps;
  - tags.
- `Tracks` panel:
  - add track;
  - target kind: bone/part/project/stateMachine;
  - target id;
  - property.
- Keyframe editor:
  - time;
  - value;
  - interpolation;
  - curve preset;
  - delete/copy/paste.
- Timeline interaction:
  - drag key;
  - box select;
  - snapping;
  - current time scrubber;
  - playhead.
- Auto-key:
  - explicit toggle;
  - creates key on transform edit;
  - visible status.

### 6. Настроить кривые и переходы

Результат: **runtime data есть, UI почти отсутствует**.

Наблюдения:

- `Animate -> Curve` меняет summary.
- `Animate -> Transition` добавляет `walk->jump`.
- Inspector summary показывает:
  - curve key list;
  - `idle->walk, walk->jump`;
  - parameters list.

Проблемы:

- `Curve` mode не открывает graph editor.
- Нет canvas/SVG-графика кривой.
- Нет editing handles для cubic bezier.
- Нет preset picker.
- Нет numeric curve inputs.
- Нет transition editor:
  - from state;
  - to state;
  - duration;
  - easing;
  - priority;
  - canInterrupt;
  - syncMode.
- Нет condition editor:
  - parameter;
  - operator;
  - value.
- Нет visual State Machine graph.
- Нет live transition preview.

Что нужно:

- Graph editor для selected key/track.
- Curve preset menu:
  - linear;
  - step;
  - hold;
  - bezier;
  - spring;
  - anticipation;
  - overshoot.
- State machine graph:
  - nodes;
  - transition edges;
  - selected edge inspector;
  - parameter panel.
- Transition preview:
  - simulate params;
  - show active state;
  - show transition weight;
  - show current clip/blend tree weights.

### 7. Экспортировать

Результат: **не проходит как заявленный export bundle**.

Проверенные действия:

- Top-level `Export` clicked.
- `Project` menu opened.
- `Project -> Copy JSON` clicked.

Фактическое поведение:

- Top-level `Export` не положил bundle в clipboard.
- После `Export` clipboard остался пустым.
- `Project` menu содержит только:
  - `Save`;
  - `Load`;
  - `Copy JSON`.
- `Export Bundle` отсутствует.
- `Import Clipboard` отсутствует.
- `Copy JSON` кладет в clipboard editor-wrapper:

```json
{
  "schemaVersion": "1.0.0",
  "savedAt": "...",
  "project": { ... }
}
```

Это не canonical `RigProject`, потому что top-level содержит `project`, а не `runtimeTarget`, `rigs`, `animations`, `stateMachines`.

Проблемы:

- Нельзя получить `hero.compiled.json` из UI.
- Нельзя получить разделенные files:
  - `hero.source.rig.json`;
  - `hero.rig.json`;
  - `hero.animations.json`;
  - `hero.state-machine.json`;
  - `hero.compiled.json`.
- Нет validation result UI.
- Нет download buttons.
- Нет export preview.
- Нет compressed package/gzip/brotli option.
- Нет подтверждения, что SVG был vectorized перед export.

Что нужно:

- `Export` modal:
  - source JSON;
  - compiled JSON;
  - split files;
  - zip package;
  - optional gzip/brotli.
- Validation panel:
  - schema validation errors;
  - compile errors;
  - warnings: SVG still present, unbound parts, empty tracks, missing state machine.
- Download/copy controls:
  - copy source;
  - copy compiled;
  - download all;
  - download selected.
- Export summary:
  - bones count;
  - parts count;
  - path parts count;
  - svg parts count;
  - animations count;
  - state machines count;
  - compiled size.

## Разрыв между исходником и запущенным UI

В текущих файлах репозитория есть элементы, которых не видно в браузере:

- `apps/editor/app/page.tsx` содержит inspector buttons:
  - `Vectorize`;
  - `Mirror`;
  - `Pivot 0`;
  - `Layer +`;
  - metadata buttons.
- `apps/editor/app/projectIo.ts` содержит `createProjectExportBundle`.
- `apps/editor/app/page.tsx` содержит actions:
  - `Export Bundle`;
  - `Import Clipboard`.

В Chrome после reload:

- `Vectorize` отсутствует;
- `Parent Root`/`Parent Body`/`Lock`/`Mirror ID`/`Tag`/`Facing` отсутствуют;
- `Export Bundle` отсутствует;
- `Import Clipboard` отсутствует;
- `Copy JSON` копирует старый wrapper format.

Вероятные причины:

1. Dev server запущен не на текущем рабочем дереве.
2. Next dev/prod server использует stale `.next` bundle.
3. Browser tab подключен к старой версии после hot reload failure.
4. На `localhost:3000` работает другой checkout/process.

Что нужно сделать первым:

```txt
остановить текущий dev server
очистить/перезапустить Next server
проверить, что bundle соответствует apps/editor/app/page.tsx
повторить browser audit
```

## UX/layout проблемы

### 1. Inspector слишком узкий

Наблюдение:

- Значения в полях обрезаются:
  - `Mode` видно как `Pr...`;
  - `Selection` видно как `bo...`;
  - asset file name обрезан.

Что нужно:

- Увеличить inspector width.
- Использовать responsive two-column layout только при достаточной ширине.
- Для длинных ids дать tooltip/copy.
- Не показывать read-only values как маленькие text inputs, если текст не помещается.

### 2. Основные операции спрятаны в dropdown

Наблюдение:

- `Add Bone`, `Move`, `Rotate`, `Rename` доступны только через `Rig` dropdown.
- `Add Key`, `Curve`, `Transition` доступны только через `Animate` dropdown.

Что нужно:

- Для активного режима показывать persistent toolbar.
- В Rig mode: Add Bone, Rename, Delete, Parent, Mirror, Lock.
- В Shape mode: Import SVG, Vectorize, Pen, Mirror, Pivot, Draw Order.
- В Timeline mode: Add Clip, Add Track, Add Key, Auto-key, Snap, Delete.

### 3. Режимы выглядят как tabs, но не меняют workspace

Наблюдение:

- `Timeline`, `Curve`, `State Machine`, `Procedural`, `Preview` меняют только `Mode` field.
- Центральный workspace остается почти тем же.

Что нужно:

- Каждый mode должен менять центральную рабочую поверхность:
  - Rig: skeleton handles;
  - Shape: path editor;
  - Pose: pose library + apply/capture;
  - Timeline: dope sheet;
  - Curve: graph editor;
  - State Machine: graph editor;
  - Procedural: parameter panels + live preview;
  - Preview: gameplay/LDtk simulator.

## Приоритетный план доработок

### P0 — Синхронизировать dev server и рабочее дерево

Цель: убедиться, что Chrome показывает актуальный код.

Критерий:

- `Vectorize` виден для SVG part.
- `Project -> Export Bundle` виден.
- `Copy JSON` копирует canonical `RigProject`, если это текущий контракт.

### P0 — Восстановить export pipeline в UI

Цель: сценарий должен завершаться получением compiled JSON.

Минимум:

- `Export Bundle` в Project menu.
- Top-level `Export` вызывает тот же flow.
- UI показывает validation status.
- Clipboard/download содержит `hero.compiled.json`.

### P0 — Сделать SVG -> Path доступным из UI

Цель: пользователь может выбрать SVG part и перекодировать его.

Минимум:

- `Vectorize` button visible.
- После click:
  - type `svg -> path`;
  - points count > 0;
  - source JSON содержит `path.commands`.
- Error message для unsupported SVG.

### P1 — Реальный Rig editor

Минимум:

- editable bone id/name;
- editable transform fields;
- parent selector;
- add/delete/rename dialogs;
- canvas handles.

### P1 — Реальный Shape editor

Минимум:

- part list;
- SVG import;
- bind/unbind to bone;
- path points view;
- point selection/move;
- pivot editor;
- draw order.

### P1 — Timeline MVP

Минимум:

- clip selector/creator;
- track creator;
- keyframe add/edit/delete;
- scrubber;
- selected key inspector.

### P1 — Curve + State Machine MVP

Минимум:

- curve preset picker;
- cubic bezier editor;
- state node list/graph;
- transition editor;
- condition editor.

### P2 — Production polish

- zip/gzip/brotli export;
- visual diff SVG vs path;
- mobile viewport pass;
- keyboard shortcuts;
- file open/save;
- project migration warnings;
- automated browser smoke tests for this exact scenario.

## Итоговая оценка сценария

| Шаг | Статус |
| --- | --- |
| Открыть editor | Работает |
| Увидеть sample skeleton | Работает |
| Создать bone | Частично |
| Переименовать bone | Частично, без ввода |
| Move/Rotate bone | Частично, фиксированные действия |
| Задать parent/metadata | Не доступно в текущем UI |
| Увидеть SVG привязку | Работает для sample |
| Добавить новый SVG | Не реализовано в UI |
| Привязать SVG к bone | Не реализовано как SVG workflow |
| Vectorize SVG -> path | Не доступно в текущем UI |
| Создать keyframe | Частично, preset action |
| Настроить curve | Частично, preset action |
| Создать transition | Частично, preset action |
| Timeline editor | Не готов |
| Curve editor | Не готов |
| State Machine editor | Не готов |
| Export source JSON | Частично, но формат старый wrapper |
| Export compiled JSON | Не доступно |
| Export compressed package | Не реализовано |

Полный сценарий сейчас закрыт примерно на **30-35% как пользовательский интерфейс**. Runtime и data model сильнее, но editor UI пока не дает пройти workflow без внутренних preset-команд и ручной работы с кодом.
