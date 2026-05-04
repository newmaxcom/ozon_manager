# ozon_manager

Сервис-аналог [wber_manager](../wber_manager/CLAUDE.md) для Ozon. На текущий момент — единственный эндпоинт: ручной перенос плана продаж из внешней MySQL-БД в общую PostgreSQL `texmod`. Запускается через Gateway по `/api/ozon-manager/*`.

## Стек

- **Express 5** + Sequelize 6 (PostgreSQL `texmod`).
- **mysql2** для подключения к внешней БД с хранимой процедурой `adaptPlan`.
- `moment` для форматирования дат.
- `newmax-utils` (`bulkCreate`, `serviceInvoker`).
- Точка входа: [index.js](index.js); роуты: [routes/](routes/); сервисы: [services/](services/); внешний коннектор: [utils/externalPlanDb.js](utils/externalPlanDb.js).

## Запуск

- `npm start` → `node index.js`.
- Docker: контейнер `ozon-manager` в сети `texmod-net`. Dev port `DEV_OZON_MANAGER_PORT`, prod `OZON_MANAGER_PORT`.
- Через [Gateway](../Gateway/CLAUDE.md): `/api/ozon-manager/*`.

## Порты и env

| Переменная | Назначение |
|---|---|
| `OZON_MANAGER_PORT` / `DEV_OZON_MANAGER_PORT` | порт сервиса |
| `DB_*` / `DEV_DB_*` | PostgreSQL `texmod` |
| `OZON_PLAN_DB_HOST` | внешний MySQL с `CALL adaptPlan(date)` |
| `OZON_PLAN_DB_PORT` | порт MySQL (default 3306) |
| `OZON_PLAN_DB_USER`, `OZON_PLAN_DB_PASSWORD` | учётные |
| `OZON_PLAN_DB_NAME` | имя БД (`ozon`) |

## REST-эндпоинты

| Путь | Метод | Описание |
|---|---|---|
| `/plan/set.selling` | POST | принимает `{ date }`, тянет `CALL adaptPlan(date)`, фильтрует по существующим `ozon.ozon_cards_goods.nmid`, пишет в `ozon_plan.selling`. |
| `/health` | GET | health-check |
| `/metrics` | GET | Prometheus метрики |

## Sequelize-модели

| Модель | Схема.таблица | PK | Источник |
|---|---|---|---|
| CardsModel | `ozon.ozon_cards_goods` | `nmid` | наполняется [ozon_parser](../ozon_parser/CLAUDE.md), читаем `nmid` + `company` + `vendor_code` |
| SellingModel | `ozon_plan.selling` | composite (`art_group`, `nmid`, `company`, `date`) | пишем здесь |

`ozon_plan.selling` зеркалит `wber_plan.selling`: поля `month, art_group, sales_qty, sales_amount, order_qty, order_amount, profit_amount, nmid, company, date`.

Лукап `nmid` + `company`: [utils/createGroupData.js](utils/createGroupData.js) собирает `groupData[(company + vendor_code).replace(/\s/g, "")] → { nmid, company, vendor_code }` из `ozon.ozon_cards_goods`. В сервисе ключ — `item.fk_nom_id.replace("OZON", "")` из внешней БД, `art_group` берётся из `item.supArt`.

## Внешний MySQL

`mysql2/promise` pool в [utils/externalPlanDb.js](utils/externalPlanDb.js). Хранимая процедура `adaptPlan(date)` собирает агрегаты в исходной БД `ozon`. Возвращает строки с полями: `month`, `fk_nom_id` (с префиксом `OZON`), `supArt`, `sales_qty`, `sales_amount`, `order_qty`, `order_amount`, `profit`.

## Связи

- **[ozon_parser](../ozon_parser/CLAUDE.md)** — общая таблица `ozon.ozon_cards_goods` (наполняется парсером, читается здесь).
- **Внешний MySQL `ozon`** — источник плана.

## Что обычно меняют

- Новые источники плана / поля → расширить `Plan.service` + модель `ozon_plan.selling`.
- Новые эндпоинты Ozon manager → новые роуты в [routes/](routes/) + сервисы по схеме wber_manager.
