# Browser visual smoke для editor

Дата: 2026-06-22

## Автоматический запуск

Предусловия:

- editor dev server запущен на `http://localhost:3000/`;
- в окружении CI доступен `playwright`.

Команда:

```bash
pnpm smoke:editor-browser
```

Опционально:

```bash
EDITOR_URL=http://localhost:3000/ pnpm smoke:editor-browser
```

Скрипт возвращает JSON с полями:

- `identity` - виден editor shell;
- `nonblank` - есть canvas/svg viewport;
- `noFrameworkOverlay` - нет Next/framework overlay;
- `scenarios` - проходят `idle`, `walk`, `jump`, `fall`, `land`;
- `graph` - виден State Machine Graph;
- `export` - export собирает `7 files ready`, включая `hero.compiled.json` и `hero.release-manifest.json`;
- `responsive` - editor остается видимым на mobile viewport;
- `consoleErrors` и `pageErrors` пустые.

Если Playwright не установлен, скрипт завершится с JSON `missingDependency: "playwright"`. Это не меняет production bundle; зависимость можно добавить только в CI/dev toolchain.

## Manual fallback

1. Открыть `http://localhost:3000/`.
2. Проверить, что видны `Bones`, mode tabs, Hierarchy, Inspector, Timeline.
3. Убедиться, что нет framework overlay и console errors приложения.
4. В `Rig` проверить один визуальный skeleton overlay поверх персонажа.
5. В `Preview` нажать `idle`, `walk`, `jump`, `fall`, `land`; debug scenario должен меняться.
6. В `State Machine` проверить видимость `State Machine Graph`.
7. В `Timeline` перетащить keyframe; точка должна двигаться без layout jump.
8. Нажать `Export`; ожидаемый результат - `7 files ready`, `hero.compiled.json`, `hero.release-manifest.json`, `hero.compiled.json.gz`.
9. Изменить ширину окна до mobile-like размера; панели должны оставаться видимыми, без framework overlay.

Успех: все пункты проходят, export не содержит SVG в source/compiled runtime artifact, preview остается видимым после export.
