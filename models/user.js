import { DataTypes } from "sequelize";
import { sequelize } from "#core/sequelize";

const schema = "private";

const UserModel = sequelize.define(
  "ozon_users",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_admin",
    },
  },
  {
    schema,
    tableName: "ozon_users",
    createdAt: true,
    updatedAt: true,
  }
);

const UserSchema = {
  UserModel,
};

export default UserSchema;
