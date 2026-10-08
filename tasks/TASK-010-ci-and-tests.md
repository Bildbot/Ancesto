# TASK-010: Расширение CI и тестового покрытия

**Приоритет:** P1
**Статус:** не начато

## Проблема

CI в `.github/workflows/deploy-pages.yml:37` проверяет только TypeScript-тесты и web build. Критическая Rust-логика SQLite и backup не запускается. Vitest работает в `node`, поэтому основные пользовательские потоки не покрыты. Скрипт `lint` является только typecheck, а TypeScript strict mode не включён.

## Объём работ

- Добавить CI job для `cargo fmt --check`, `cargo clippy -- -D warnings` и `cargo test --locked`.
- Запускать native job как минимум на Windows; при возможности также на Linux.
- Добавить React Testing Library для ключевых компонентов.
- Добавить Playwright smoke-тесты основных web-сценариев.
- Выделить отдельные npm-скрипты `typecheck`, `lint`, `test` и `test:e2e`.
- Добавить ESLint и постепенно включать `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- Pin критичных GitHub Actions по commit SHA.

## Минимальные сценарии

- Создание и безопасное удаление персоны.
- Ручное прикрепление медиа и разметка архивного фото.
- Успешный и неуспешный импорт.
- Backup/restore и повторный запуск desktop-приложения.
- PWA offline и базовая keyboard/focus accessibility.

## Готовность

- [ ] TypeScript, Rust и web build обязательны для merge.
- [ ] Clippy и rustfmt проходят без предупреждений.
- [ ] Критические пользовательские сценарии имеют автотесты.
- [ ] Линтинг отделён от проверки типов.
- [ ] Усиление TypeScript выполняется без подавления ошибок через массовый `any`.
- [ ] CI документирован и стабильно проходит на чистом checkout.
