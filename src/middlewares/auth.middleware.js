import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

export async function requireAuth(req, res, next) {
  const authorization = req.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return res.status(401).json({
      message: "Bạn cần gửi token theo dạng Bearer",
    });
  }

  let payload;

  try {
    payload = jwt.verify(match[1], process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    return res.status(401).json({
      message: "Token không hợp lệ hoặc đã hết hạn",
    });
  }

  if (
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    !/^[1-9]\d*$/.test(payload.sub) ||
    !Number.isInteger(payload.exp)
  ) {
    return res.status(401).json({
      message: "Nội dung token không hợp lệ",
    });
  }

  const uid = Number(payload.sub);

  if (!Number.isSafeInteger(uid) || uid > 2147483647) {
    return res.status(401).json({
      message: "Mã tài khoản trong token không hợp lệ",
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { uid },
      select: {
        uid: true,
        username: true,
        fullname: true,
        role: {
          select: { roleid: true, rolename: true },
        },
        membership: {
          select: { mid: true, mname: true },
        },
      },
    });

    if (!user) {
      return res.status(401).json({
        message: "Tài khoản không còn tồn tại",
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}
