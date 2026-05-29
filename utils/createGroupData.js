import OzonCommonSchema from "#models/ozon";

// Индекс карточек для матчинга плана по (кабинет + артикул).
// Возвращает Map: company -> массив { vendor_code, nmid }, отсортированный по
// nmid (для детерминированного выбора представителя). Сам матчинг (vendor_code
// начинается с артикула на границе) — в Plan.service.
export default async function createGroupData() {
  const cards = await OzonCommonSchema.CardsModel.findAll({
    attributes: ["nmid", "company", "vendor_code"],
  });

  const byCompany = new Map();
  for (const row of cards) {
    const { nmid, company, vendor_code } = row.dataValues;
    if (!nmid || !company || !vendor_code) continue;
    if (!byCompany.has(company)) byCompany.set(company, []);
    byCompany
      .get(company)
      .push({ vendor_code: String(vendor_code), nmid: String(nmid) });
  }
  for (const list of byCompany.values()) {
    list.sort((a, b) => a.nmid.localeCompare(b.nmid));
  }
  return byCompany;
}
