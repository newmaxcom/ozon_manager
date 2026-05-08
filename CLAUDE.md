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
| `/brand-monitor/run` | POST | сканирует Ozon-каталог по нашим брендам через Gologin (`ozon-dolg`), классифицирует карточки (свои / suspicious / паразиты), пишет в Google Sheets. Опц. `{ brand?: "OIRO" }` — прогнать один бренд из конфига. |
| `/invoices/push.sheet` | GET/POST | читает `ozon_report.invoices`, строит таблицу как в LK Ozon (Тип выплаты / Сумма / Статус / Период / Номер документа) и переписывает лист в Google Sheets. Cron 04:30. |
| `/health` | GET | health-check |
| `/metrics` | GET | Prometheus метрики |

## Sequelize-модели

| Модель | Схема.таблица | PK | Источник |
|---|---|---|---|
| CardsModel | `ozon.ozon_cards_goods` | `nmid` | наполняется [ozon_parser](../ozon_parser/CLAUDE.md), читаем `nmid` + `company` + `vendor_code` |
| SellingModel | `ozon_plan.selling` | composite (`art_group`, `nmid`, `company`, `date`) | пишем здесь |
| InvoicesModel | `ozon_report.invoices` | composite (`company`, `id`) | наполняется [ozon_parser](../ozon_parser/CLAUDE.md), читаем для выгрузки в Google Sheet |

`ozon_plan.selling` зеркалит `wber_plan.selling`: поля `month, art_group, sales_qty, sales_amount, order_qty, order_amount, profit_amount, nmid, company, date`.

Лукап `nmid` + `company`: [utils/createGroupData.js](utils/createGroupData.js) собирает `groupData[(company + vendor_code).replace(/\s/g, "")] → { nmid, company, vendor_code }` из `ozon.ozon_cards_goods`. В сервисе ключ — `item.fk_nom_id.replace("OZON", "")` из внешней БД, `art_group` берётся из `item.supArt`.

## Внешний MySQL

`mysql2/promise` pool в [utils/externalPlanDb.js](utils/externalPlanDb.js). Хранимая процедура `adaptPlan(date)` собирает агрегаты в исходной БД `ozon`. Возвращает строки с полями: `month`, `fk_nom_id` (с префиксом `OZON`), `supArt`, `sales_qty`, `sales_amount`, `order_qty`, `order_amount`, `profit`.

## Brand-monitor

- Конфиг брендов и spreadsheetId — [configs/brandMonitor.config.js](configs/brandMonitor.config.js): `BRANDS[]`, `OWN_SELLER_IDS`, `SPREADSHEET_ID`, `CABINET=DOLG`.
- Оркестратор [services/BrandMonitor.service.js](services/BrandMonitor.service.js): для каждого бренда из конфига строит URL'ы → `POST http://dispatcher:41000/gologin/DOLG/ozon/brand-monitor/scan` → агрегирует карточки → пишет 5 листов через [utils/brandMonitorSheets.js](utils/brandMonitorSheets.js) (`google-spreadsheet` 4.x, JWT-auth из `GOOGLE_KEY*`).
- Воркер ([gologin_service](../../Gologin/gologin_service/CLAUDE.md)) на стороне `ozon-dolg`: `withPageRaw` (без auth-check), перехват `entrypoint-api.bx` через `ResponseSniffer`, скролл с детектором стабильности, классификация (`OWN_BRAND_OFFICIAL` / `SUSPICIOUS_NO_BADGE` / `NAMING_PARASITE` / `OTHER`), enrichment sellerId через PDP (≤100 запросов, пауза 1.5–3 сек), возврат JSON.
- Листы: «Ozon — свои», «Ozon — паразиты», «Ozon — сводка по продавцам», «Ozon — история» (append + `run_id`), «Ozon — лог».

## Cron (`node-cron`, только в production)

| Время (MSK) | Задача |
|---|---|
| 04:30 | `Invoices.pushToSheet` — выгрузка `ozon_report.invoices` в Google Sheet (после `setInvoices` парсера в 04:00) |

## Invoices (выплаты Ozon)

- Конфиг: [configs/invoices.config.js](configs/invoices.config.js) — `SPREADSHEET_ID`, `SHEET_TITLE`, маппинги `PAYMENT_TYPE_LABELS` (docTypeSysName → "Оплата реализации" / "Выплата по товарным компенсациям" / "Оплата выкупов маркетплейсом") и `STATUS_LABELS` (`WaitingForPayment` → "Ожидает выплаты", `Paid` → "Выплачена").
- Маппинг кабинета → организация — [enum/inn.js](enum/inn.js) (`enumOrganization`, перенесён из onec-setter).
- Сервис [services/Invoices.service.js](services/Invoices.service.js): читает все строки `ozon_report.invoices` (sort by `schedule_payment_date DESC`), форматирует даты `DD.MM.YYYY`, период `from – to`, сумму `1 234,56`, документ `№<num> от <дата>`. Использует [utils/brandMonitorSheets.js](utils/brandMonitorSheets.js#L33) (`replaceRows` — clear + setHeaderRow + addRows).

## Связи

- **[ozon_parser](../ozon_parser/CLAUDE.md)** — общие таблицы `ozon.ozon_cards_goods` и `ozon_report.invoices` (наполняются парсером, читаются здесь).
- **[Gologin Dispatcher](../../Gologin/gologin_service/CLAUDE.md)** — `POST /gologin/DOLG/ozon/brand-monitor/scan` для brand-monitor.
- **Внешний MySQL `ozon`** — источник плана.
- **Google Sheets** (spreadsheetId в конфиге) — таргет brand-monitor.

## Что обычно меняют

- Новые источники плана / поля → расширить `Plan.service` + модель `ozon_plan.selling`.
- Новые эндпоинты Ozon manager → новые роуты в [routes/](routes/) + сервисы по схеме wber_manager.
