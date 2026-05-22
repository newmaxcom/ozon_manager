import bcrypt from "bcrypt";
import UserSchema from "#models/user";

class User {
  constructor() {
    this.schema = "user";
    this.isReady = false;
  }

  ensureReady = async () => {
    if (this.isReady) {
      return;
    }

    await UserSchema.UserModel.sync();

    const usersCount = await UserSchema.UserModel.count();
    if (usersCount === 0) {
      const username =
        process.env.OZON_DEFAULT_ADMIN_USERNAME || "Administrator";
      const email = (
        process.env.OZON_DEFAULT_ADMIN_EMAIL || "admin@ozon.local"
      ).toLowerCase();
      const password =
        process.env.OZON_DEFAULT_ADMIN_PASSWORD || "Admin123!";
      const passwordHash = await bcrypt.hash(password, 10);

      await UserSchema.UserModel.create({
        username,
        email,
        password: passwordHash,
        isAdmin: true,
      });
    }

    this.isReady = true;
  };

  sanitizeUser = (user) => {
    const plainUser = user?.get ? user.get({ plain: true }) : user;

    if (!plainUser) {
      return null;
    }

    const { password, ...safeUser } = plainUser;
    return safeUser;
  };

  normalizeEmail = (email) => String(email).trim().toLowerCase();

  validateUserData = ({ username, email, password }, isCreate = true) => {
    if (isCreate && (!username || String(username).trim().length < 2)) {
      throw new Error("Имя пользователя должно содержать минимум 2 символа");
    }

    if (email !== undefined) {
      const normalizedEmail = this.normalizeEmail(email);
      const emailRegexp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegexp.test(normalizedEmail)) {
        throw new Error("Укажите корректный email");
      }
    }

    if (password !== undefined && String(password).length < 6) {
      throw new Error("Пароль должен содержать минимум 6 символов");
    }
  };

  getByEmail = async (email) => {
    await this.ensureReady();

    return UserSchema.UserModel.findOne({
      where: {
        email: this.normalizeEmail(email),
      },
    });
  };

  getById = async (id) => {
    await this.ensureReady();

    return UserSchema.UserModel.findByPk(id);
  };

  countAdmins = async () => {
    await this.ensureReady();

    return UserSchema.UserModel.count({
      where: {
        isAdmin: true,
      },
    });
  };

  list = async () => {
    await this.ensureReady();

    const users = await UserSchema.UserModel.findAll({
      order: [["createdAt", "DESC"]],
    });

    return {
      status: 200,
      payload: {
        users: users.map(this.sanitizeUser),
      },
    };
  };

  create = async ({ username, email, password, isAdmin = false }) => {
    await this.ensureReady();
    this.validateUserData({ username, email, password }, true);

    const normalizedEmail = this.normalizeEmail(email);
    const existedUser = await this.getByEmail(normalizedEmail);

    if (existedUser) {
      throw new Error("Пользователь с таким email уже существует");
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await UserSchema.UserModel.create({
      username: String(username).trim(),
      email: normalizedEmail,
      password: passwordHash,
      isAdmin: Boolean(isAdmin),
    });

    return {
      status: 201,
      message: "Пользователь создан",
      payload: {
        user: this.sanitizeUser(user),
      },
    };
  };

  update = async ({ id, username, email, password, isAdmin, authUser }) => {
    await this.ensureReady();

    const user = await this.getById(id);
    if (!user) {
      throw new Error("Пользователь не найден");
    }

    this.validateUserData(
      {
        username,
        email,
        password,
      },
      false
    );

    const nextIsAdmin =
      isAdmin === undefined ? user.isAdmin : Boolean(isAdmin);

    if (user.id === authUser?.id && user.isAdmin && !nextIsAdmin) {
      const adminsCount = await this.countAdmins();
      if (adminsCount <= 1) {
        throw new Error("Нельзя снять права у последнего администратора");
      }
    }

    if (email !== undefined) {
      const normalizedEmail = this.normalizeEmail(email);
      const userWithSameEmail = await this.getByEmail(normalizedEmail);

      if (userWithSameEmail && userWithSameEmail.id !== user.id) {
        throw new Error("Пользователь с таким email уже существует");
      }

      user.email = normalizedEmail;
    }

    if (username !== undefined && String(username).trim()) {
      user.username = String(username).trim();
    }

    if (password !== undefined && String(password).trim()) {
      user.password = await bcrypt.hash(String(password), 10);
    }

    user.isAdmin = nextIsAdmin;

    await user.save();

    return {
      status: 200,
      message: "Пользователь обновлён",
      payload: {
        user: this.sanitizeUser(user),
      },
    };
  };

  remove = async ({ id, authUser }) => {
    await this.ensureReady();

    const user = await this.getById(id);
    if (!user) {
      throw new Error("Пользователь не найден");
    }

    if (Number(user.id) === Number(authUser?.id)) {
      throw new Error("Нельзя удалить текущего пользователя");
    }

    if (user.isAdmin) {
      const adminsCount = await this.countAdmins();
      if (adminsCount <= 1) {
        throw new Error("Нельзя удалить последнего администратора");
      }
    }

    await user.destroy();

    return {
      status: 200,
      message: "Пользователь удалён",
    };
  };
}

export default new User();
