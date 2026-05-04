import OzonCommonSchema from "#models/ozon";

export default async function createGroupData() {
  const cards = await OzonCommonSchema.CardsModel.findAll({
    attributes: ["nmid", "company", "vendor_code"],
  });

  const groupData = {};
  cards.forEach((row) => {
    const { nmid, company, vendor_code } = row.dataValues;
    if (!nmid || !company || !vendor_code) return;
    const key = `${company}${vendor_code}`.replace(/\s/g, "");
    groupData[key] = { nmid, company, vendor_code };
  });

  return groupData;
}
