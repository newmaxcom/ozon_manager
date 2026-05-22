import bcrypt from "bcrypt";
import UserService from "#services/User";
import generateTokens from "#utils/generateTokens";

class Auth {
  constructor() {
    this.schema = "auth";
  }

  signIn = async ({ email, password }) => {
    if (!email || !password) {
      throw new Error("Укажите email и пароль");
    }

    const user = await UserService.getByEmail(email);
    if (!user) {
      throw new Error("Пользователь не найден");
    }

    const isPasswordValid = await bcrypt.compare(String(password), user.password);
    if (!isPasswordValid) {
      throw new Error("Неверный пароль");
    }

    const safeUser = UserService.sanitizeUser(user);
    const { accessToken } = generateTokens({
      user: safeUser,
    });

    return {
      status: 200,
      message: "Вход выполнен",
      payload: {
        user: safeUser,
        accessToken,
      },
    };
  };

  me = async ({ authUser }) => {
    const user = await UserService.getById(authUser?.id);
    if (!user) {
      throw new Error("Пользователь не найден");
    }

    return {
      status: 200,
      payload: {
        user: UserService.sanitizeUser(user),
      },
    };
  };

  signOut = async () => {
    return {
      status: 200,
      message: "Выход выполнен",
    };
  };
}

export default new Auth();
