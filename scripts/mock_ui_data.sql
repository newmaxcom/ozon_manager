-- ─────────────────────────────────────────────────────────────────────────
-- Моковые данные для UI-тестирования ozon_client.
--
-- Создаёт 12 разнообразных строк в onec_supply.ozon_supplies_queue
-- (все этапы пайплайна и все state-варианты Ozon), коробки для трёх
-- заявок и записи supply_status, чтобы dashboard показывал JOIN с парсером.
--
-- Все doc_number начинаются с "MOCK-" — секция в конце удаляет именно их,
-- скрипт идемпотентен (можно запускать повторно).
--
-- Запуск из DBeaver: открыть как .sql, F5 (Run All).
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- 0. Удалить предыдущие моки (идемпотентность)
DELETE FROM onec_supply.ozon_supply_boxes
 WHERE order_id IN (
     SELECT order_id FROM onec_supply.ozon_supplies_queue
      WHERE doc_number LIKE 'MOCK-%'
 );
DELETE FROM onec_supply.ozon_supplies_queue
 WHERE doc_number LIKE 'MOCK-%';
DELETE FROM ozon_supply.supply_status
 WHERE supply_id LIKE 'MOCK-NUM-%';

-- 1. Очередь поставок: разные этапы и состояния
INSERT INTO onec_supply.ozon_supplies_queue (
    doc_number, order_numbers, account,
    onec_prefix, plan_date, items,
    macrolocal_cluster_id, draft_id, storage_warehouse_id, bundle_id,
    timeslot_from, timeslot_to,
    order_id, order_number, supply_id, data_filling_deadline_utc,
    state, is_error, error_text, is_for_push,
    created_at, updated_at
) VALUES
-- 1.1 Только что попало из 1С, ещё не создан черновик
('MOCK-001', '1', 'TMOD', 'ТМ', '2026-06-10',
 '[{"barcode":"4607021391122","sku":1234567890,"quantity":5},{"barcode":"4607021391139","sku":9876543210,"quantity":3}]'::jsonb,
 24, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
 NULL, false, NULL, false, now() - interval '5 min', now() - interval '5 min'),

-- 1.2 Создан черновик, ещё не заявка
('MOCK-002', '1;2', 'SMRZ', 'МС', '2026-06-11',
 '[{"barcode":"4607021391146","sku":1111111111,"quantity":10}]'::jsonb,
 24, 555000111, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
 NULL, false, NULL, false, now() - interval '20 min', now() - interval '15 min'),

-- 1.3 Заявка создана, статус DATA_FILLING (только что появилась)
('MOCK-003', '5', 'TMOD', 'ТМ', '2026-06-12',
 '[{"barcode":"4607021391153","sku":2222222222,"quantity":12}]'::jsonb,
 24, 555000112, 1020000091, 'bundle-aaa-111',
 '2026-06-12T10:00:00+03:00', '2026-06-12T12:00:00+03:00',
 100001, 'MOCK-NUM-100001', 880001, '2026-06-13T18:00:00Z',
 'DATA_FILLING', false, NULL, false, now() - interval '40 min', now() - interval '40 min'),

-- 1.4 READY_TO_SUPPLY — готово к отгрузке
('MOCK-004', '7', 'MUNI', 'МЛ', '2026-06-14',
 '[{"barcode":"4607021391160","sku":3333333333,"quantity":6},{"barcode":"4607021391177","sku":4444444444,"quantity":2}]'::jsonb,
 36, 555000113, 1020000202, 'bundle-bbb-222',
 '2026-06-14T08:00:00+03:00', '2026-06-14T10:00:00+03:00',
 100002, 'MOCK-NUM-100002', 880002, '2026-06-13T18:00:00Z',
 'READY_TO_SUPPLY', false, NULL, true, now() - interval '2 hour', now() - interval '1 hour'),

-- 1.5 ACCEPTED_AT_SUPPLY_WAREHOUSE — приехала на склад отгрузки
('MOCK-005', '8', 'SMRZ', 'МС', '2026-06-10',
 '[{"barcode":"4607021391184","sku":5555555555,"quantity":8}]'::jsonb,
 24, 555000114, 1020000091, 'bundle-ccc-333',
 '2026-06-10T14:00:00+03:00', '2026-06-10T16:00:00+03:00',
 100003, 'MOCK-NUM-100003', 880003, NULL,
 'ACCEPTED_AT_SUPPLY_WAREHOUSE', false, NULL, true, now() - interval '2 day', now() - interval '6 hour'),

-- 1.6 IN_TRANSIT — в пути на склад хранения
('MOCK-006', '11', 'TMOD', 'ТМ', '2026-06-09',
 '[{"barcode":"4607021391191","sku":6666666666,"quantity":15}]'::jsonb,
 36, 555000115, 1020000202, 'bundle-ddd-444',
 '2026-06-09T11:00:00+03:00', '2026-06-09T13:00:00+03:00',
 100004, 'MOCK-NUM-100004', 880004, NULL,
 'IN_TRANSIT', false, NULL, false, now() - interval '3 day', now() - interval '12 hour'),

-- 1.7 ACCEPTANCE_AT_STORAGE_WAREHOUSE — приёмка на складе хранения
('MOCK-007', '15', 'DOLG', 'ДО', '2026-06-08',
 '[{"barcode":"4607021391207","sku":7777777777,"quantity":20}]'::jsonb,
 24, 555000116, 1020000091, 'bundle-eee-555',
 '2026-06-08T09:00:00+03:00', '2026-06-08T11:00:00+03:00',
 100005, 'MOCK-NUM-100005', 880005, NULL,
 'ACCEPTANCE_AT_STORAGE_WAREHOUSE', false, NULL, false, now() - interval '5 day', now() - interval '1 day'),

-- 1.8 COMPLETED — успешно завершено
('MOCK-008', '20', 'EVSO', 'СО', '2026-06-05',
 '[{"barcode":"4607021391214","sku":8888888888,"quantity":4}]'::jsonb,
 36, 555000117, 1020000202, 'bundle-fff-666',
 '2026-06-05T13:00:00+03:00', '2026-06-05T15:00:00+03:00',
 100006, 'MOCK-NUM-100006', 880006, NULL,
 'COMPLETED', false, NULL, false, now() - interval '8 day', now() - interval '3 day'),

-- 1.9 CANCELLED — отменено вручную
('MOCK-009', '22', 'TMOD', 'ТМ', '2026-06-07',
 '[{"barcode":"4607021391221","sku":9999999999,"quantity":7}]'::jsonb,
 24, 555000118, 1020000091, 'bundle-ggg-777',
 NULL, NULL, 100007, 'MOCK-NUM-100007', 880007, NULL,
 'CANCELLED', false, NULL, false, now() - interval '4 day', now() - interval '2 day'),

-- 1.10 OVERDUE — пропущен дедлайн
('MOCK-010', '25', 'KAKU', 'АК', '2026-06-06',
 '[{"barcode":"4607021391238","sku":1010101010,"quantity":9}]'::jsonb,
 36, 555000119, 1020000202, 'bundle-hhh-888',
 '2026-06-06T07:00:00+03:00', '2026-06-06T09:00:00+03:00',
 100008, 'MOCK-NUM-100008', 880008, '2026-06-05T18:00:00Z',
 'OVERDUE', false, NULL, false, now() - interval '6 day', now() - interval '4 day'),

-- 1.11 Ошибка создания черновика
('MOCK-011', '30', 'SMRZ', 'МС', '2026-06-15',
 '[{"barcode":"4607021391245","sku":2020202020,"quantity":3}]'::jsonb,
 24, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
 NULL, true,
 'SKU 2020202020 не найден в кабинете TMOD. Проверьте товары в Ozon Seller.',
 false, now() - interval '1 hour', now() - interval '55 min'),

-- 1.12 Несколько строк на один документ (разные order_numbers, разные ЛК)
('MOCK-012', '40', 'TMOD', 'ТМ', '2026-06-16',
 '[{"barcode":"4607021391252","sku":3030303030,"quantity":2}]'::jsonb,
 24, 555000121, 1020000091, 'bundle-iii-999',
 NULL, NULL, 100009, 'MOCK-NUM-100009', 880009, '2026-06-15T18:00:00Z',
 'DATA_FILLING', false, NULL, false, now() - interval '30 min', now() - interval '30 min'),
('MOCK-012', '41', 'MUNI', 'МЛ', '2026-06-16',
 '[{"barcode":"4607021391269","sku":4040404040,"quantity":5}]'::jsonb,
 24, 555000122, 1020000091, 'bundle-iii-aaa',
 NULL, NULL, 100010, 'MOCK-NUM-100010', 880010, '2026-06-15T18:00:00Z',
 'DATA_FILLING', false, NULL, false, now() - interval '30 min', now() - interval '30 min');

-- 2. Коробки для нескольких заявок
INSERT INTO onec_supply.ozon_supply_boxes (
    order_id, box_index, box_key, cargo_id, cargo_type,
    items, label_file_guid, label_file_url, ozon_status,
    created_at, updated_at
) VALUES
-- order 100003 (MOCK-005): 3 короба с cargo_id и этикетками
(100003, 1, '880003-1', 7700001, 'BOX',
 '[{"barcode":"4607021391184","offer_id":"SMRZ-001","quantity":4,"expires_at":"2027-12-31"},{"barcode":"4607021391184","offer_id":"SMRZ-001","quantity":4,"expires_at":"2027-12-31"}]'::jsonb,
 'guid-001-aaa', 'https://cdn.ozon.ru/mock/labels/guid-001-aaa.pdf', 'CREATED',
 now() - interval '1 day', now() - interval '6 hour'),
(100003, 2, '880003-2', 7700002, 'BOX',
 '[{"barcode":"4607021391184","offer_id":"SMRZ-001","quantity":4,"expires_at":"2027-12-31"}]'::jsonb,
 'guid-001-aaa', 'https://cdn.ozon.ru/mock/labels/guid-001-aaa.pdf', 'CREATED',
 now() - interval '1 day', now() - interval '6 hour'),
(100003, 3, '880003-3', 7700003, 'PALLET',
 '[{"barcode":"4607021391184","offer_id":"SMRZ-001","quantity":12,"expires_at":"2027-12-31"}]'::jsonb,
 'guid-001-aaa', 'https://cdn.ozon.ru/mock/labels/guid-001-aaa.pdf', 'CREATED',
 now() - interval '1 day', now() - interval '6 hour'),

-- order 100004 (MOCK-006): 2 короба, cargo_id есть, этикетки ещё нет
(100004, 1, '880004-1', 7700010, 'BOX',
 '[{"barcode":"4607021391191","offer_id":"TMOD-006","quantity":8}]'::jsonb,
 NULL, NULL, 'CREATED',
 now() - interval '2 day', now() - interval '1 day'),
(100004, 2, '880004-2', 7700011, 'BOX',
 '[{"barcode":"4607021391191","offer_id":"TMOD-006","quantity":7}]'::jsonb,
 NULL, NULL, 'CREATED',
 now() - interval '2 day', now() - interval '1 day'),

-- order 100001 (MOCK-003): состав ещё не передан 1С (короба не созданы)
-- — пусто специально, чтобы UI показал "Грузомест ещё нет"

-- order 100002 (MOCK-004): cargoes pending — только box_key, ещё без cargo_id
(100002, 1, '880002-1', NULL, 'BOX',
 '[{"barcode":"4607021391160","offer_id":"MUNI-001","quantity":3},{"barcode":"4607021391177","offer_id":"MUNI-002","quantity":1}]'::jsonb,
 NULL, NULL, NULL,
 now() - interval '30 min', now() - interval '30 min'),
(100002, 2, '880002-2', NULL, 'BOX',
 '[{"barcode":"4607021391160","offer_id":"MUNI-001","quantity":3},{"barcode":"4607021391177","offer_id":"MUNI-002","quantity":1}]'::jsonb,
 NULL, NULL, NULL,
 now() - interval '30 min', now() - interval '30 min');

-- 3. supply_status — чтобы JOIN в dashboard показывал источник "parser"
INSERT INTO ozon_supply.supply_status (
    company, supply_id, state, status, state_updated_date, bundle_id, updated_at
) VALUES
('TMOD', 'MOCK-NUM-100001', 'DATA_FILLING',                  'Заполнение данных',     now() - interval '30 min', 'bundle-aaa-111', now()),
('MUNI', 'MOCK-NUM-100002', 'READY_TO_SUPPLY',               'Готово к отгрузке',     now() - interval '50 min', 'bundle-bbb-222', now()),
('SMRZ', 'MOCK-NUM-100003', 'ACCEPTED_AT_SUPPLY_WAREHOUSE',  'Принято на пункте',     now() - interval '6 hour', 'bundle-ccc-333', now()),
('TMOD', 'MOCK-NUM-100004', 'IN_TRANSIT',                    'В пути',                now() - interval '12 hour','bundle-ddd-444', now()),
('DOLG', 'MOCK-NUM-100005', 'ACCEPTANCE_AT_STORAGE_WAREHOUSE','Приёмка на складе',     now() - interval '1 day',  'bundle-eee-555', now()),
('EVSO', 'MOCK-NUM-100006', 'COMPLETED',                     'Завершено',             now() - interval '3 day',  'bundle-fff-666', now()),
('TMOD', 'MOCK-NUM-100007', 'CANCELLED',                     'Отменено',              now() - interval '2 day',  'bundle-ggg-777', now()),
('KAKU', 'MOCK-NUM-100008', 'OVERDUE',                       'Просрочено',            now() - interval '4 day',  'bundle-hhh-888', now()),
('TMOD', 'MOCK-NUM-100009', 'DATA_FILLING',                  'Заполнение данных',     now() - interval '20 min', 'bundle-iii-999', now()),
('MUNI', 'MOCK-NUM-100010', 'DATA_FILLING',                  'Заполнение данных',     now() - interval '20 min', 'bundle-iii-aaa', now());

COMMIT;

-- ─────────────── Проверка ───────────────
SELECT
    doc_number, account, onec_prefix,
    macrolocal_cluster_id AS cluster,
    CASE WHEN draft_id IS NULL THEN 'без draft' ELSE 'draft '||draft_id END AS draft,
    order_id, supply_id, state,
    CASE WHEN is_error THEN 'ERROR' ELSE '' END AS err
  FROM onec_supply.ozon_supplies_queue
 WHERE doc_number LIKE 'MOCK-%'
 ORDER BY updated_at DESC;

SELECT order_id, box_index, cargo_type,
       CASE WHEN cargo_id IS NULL THEN 'pending' ELSE cargo_id::text END AS cargo,
       CASE WHEN label_file_url IS NULL THEN 'no label' ELSE 'has label' END AS labels
  FROM onec_supply.ozon_supply_boxes
 WHERE order_id IN (100001, 100002, 100003, 100004)
 ORDER BY order_id, box_index;

-- ─────────────── Очистка (запускать руками) ───────────────
/*
BEGIN;
DELETE FROM onec_supply.ozon_supply_boxes
 WHERE order_id IN (
     SELECT order_id FROM onec_supply.ozon_supplies_queue
      WHERE doc_number LIKE 'MOCK-%'
 );
DELETE FROM onec_supply.ozon_supplies_queue WHERE doc_number LIKE 'MOCK-%';
DELETE FROM ozon_supply.supply_status WHERE supply_id LIKE 'MOCK-NUM-%';
COMMIT;
*/
