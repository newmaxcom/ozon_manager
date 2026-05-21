import PrivateSchema from "#models/private";
import { decryptData } from "#utils/crypto";

class OzonAccounts {
  getById = async ({ id }) => {
    try {
      const response = await PrivateSchema.OzonAccountModel.findByPk(id);

      if (!response) {
        console.log(`ЛК Ozon ${id} не найден`);
        return { status: 404, message: `Компания ${id} не найдена` };
      }

      return Object.entries(response.dataValues).reduce(
        (acc, [name, value]) => {
          if (name === "id" && value) {
            acc[name] = value;
          }
          if (name !== "id" && typeof value === "string") {
            acc[name] = decryptData(value);
          }
          return acc;
        },
        {}
      );
    } catch (error) {
      console.error("Ошибка при получении данных компании по id:", error);
      return { status: 500 };
    }
  };

  getAll = async () => {
    try {
      const response = await PrivateSchema.OzonAccountModel.findAll();

      if (!response) {
        console.log("Данные по личным кабинетам Ozon не найдены");
        return {
          status: 404,
          message: "Данные по личным кабинетам Ozon не найдены",
        };
      }

      return response.map((item) =>
        Object.entries(item.dataValues).reduce((acc, [name, value]) => {
          if (name === "id" && value) {
            acc[name] = value;
          }
          if (name !== "id" && typeof value === "string") {
            acc[name] = decryptData(value);
          }
          return acc;
        }, {})
      );
    } catch (error) {
      console.error(
        "Ошибка при получении данных по личным кабинетам Ozon",
        error
      );
      return { status: 500 };
    }
  };
}

export default new OzonAccounts();
