import { requireAuth } from "../middlewares/auth.middleware.js";
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/me", requireAuth, (req, res) => {
  res.status(200).json({
    user: req.user,
  });
});

const secret = process.env.JWT_SECRET;
const expiresIn = process.env.JWT_EXPIRES_IN;

if (!secret || secret.length < 32 || !expiresIn) {
  throw new Error("Thiếu cấu hình JWT hoặc JWT_SECRET quá ngắn");
}

const publicUserSelect = {
  uid: true,
  username: true,
  fullname: true,
  role: {
    select: { rolename: true },
  },
  membership: {
    select: { mname: true },
  },
};

function validUsername(username) {
  return (
    typeof username === "string" &&
    /^[a-zA-Z0-9_]{3,50}$/.test(username)
  );
}

function validPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    Buffer.byteLength(password, "utf8") <= 72
  );
}

// Đăng ký tài khoản khách hàng.
router.post("/register", async (req, res) => {
  const { username, fullname, password } = req.body ?? {};

  if (!validUsername(username)) {
    return res.status(400).json({
      message: "Username cần 3–50 ký tự: chữ không dấu, số hoặc dấu gạch dưới",
    });
  }

  if (
    typeof fullname !== "string" ||
    !fullname.trim() ||
    fullname.trim().length > 100
  ) {
    return res.status(400).json({
      message: "Họ tên không được trống và tối đa 100 ký tự",
    });
  }

  if (!validPassword(password)) {
    return res.status(400).json({
      message: "Mật khẩu cần ít nhất 8 ký tự và không quá 72 byte",
    });
  }

  const [role, membership] = await Promise.all([
    prisma.role.findUnique({
      where: { rolename: "CUSTOMER" },
    }),
    prisma.memberShip.findUnique({
      where: { mname: "BASIC" },
    }),
  ]);

  if (!role || !membership) {
    return res.status(503).json({
      message: "Thiếu dữ liệu mặc định, cần chạy npm run seed",
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      username,
      fullname: fullname.trim(),
      password: passwordHash,
      roleid: role.roleid,
      mid: membership.mid,
    },
    select: publicUserSelect,
  });

  return res.status(201).json({
    message: "Đăng ký thành công",
    user,
  });
});

// Đăng nhập và cấp JWT.
router.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!validUsername(username) || !validPassword(password)) {
    return res.status(400).json({
      message: "Thông tin đăng nhập không hợp lệ",
    });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      ...publicUserSelect,
      password: true,
    },
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({
      message: "Sai tên đăng nhập hoặc mật khẩu",
    });
  }

  const token = jwt.sign({}, secret, {
    algorithm: "HS256",
    subject: String(user.uid),
    expiresIn,
  });

  const { password: passwordHash, ...publicUser } = user;

  return res.status(200).json({
    message: "Đăng nhập thành công",
    token,
    tokenType: "Bearer",
    user: publicUser,
  });
});

router.use((error, req, res, next) => {
  if (error.code === "P2002") {
    return res.status(409).json({
      message: "Tên đăng nhập đã tồn tại",
    });
  }

  console.error("Lỗi API tài khoản:", error.message);

  return res.status(500).json({
    message: "Lỗi hệ thống, vui lòng thử lại sau",
  });
});

export default router;
