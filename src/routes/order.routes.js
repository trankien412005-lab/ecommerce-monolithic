import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(requireAuth);

function positiveInt(value) {
  return Number.isInteger(value) && value > 0 && value <= 2147483647;
}

function orderError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const orderInclude = {
  orderDetails: {
    include: {
      product: {
        select: { pid: true, pname: true },
      },
    },
  },
  shipments: true,
};

// Tạo đơn cho người đang đăng nhập.
router.post("/", async (req, res) => {
  const items = req.body?.items;

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return res.status(400).json({
      message: "Đơn hàng cần từ 1 đến 50 loại sản phẩm",
    });
  }

  const seen = new Set();

  for (const item of items) {
    if (!item || !positiveInt(item.pid) || !positiveInt(item.qty)) {
      return res.status(400).json({
        message: "pid và qty phải là số nguyên dương hợp lệ",
      });
    }

    if (seen.has(item.pid)) {
      return res.status(400).json({
        message: "Không được lặp lại pid trong cùng đơn hàng",
      });
    }

    seen.add(item.pid);
  }

  const sortedItems = [...items].sort((a, b) => a.pid - b.pid);

  const order = await prisma.$transaction(async (tx) => {
    const details = [];

    for (const item of sortedItems) {
      const result = await tx.product.updateMany({
        where: {
          pid: item.pid,
          quantity: { gte: item.qty },
        },
        data: {
          quantity: { decrement: item.qty },
        },
      });

      if (result.count !== 1) {
        throw orderError(
          409,
          `Sản phẩm ${item.pid} không tồn tại hoặc không đủ tồn kho`
        );
      }

      const product = await tx.product.findUnique({
        where: { pid: item.pid },
        select: { price: true },
      });

      details.push({
        pid: item.pid,
        qty: item.qty,
        unit_price: product.price,
      });
    }

    return tx.order.create({
      data: {
        uid: req.user.uid,
        orderDetails: { create: details },
      },
      include: orderInclude,
    });
  });

  return res.status(201).json({
    message: "Đặt hàng thành công",
    order,
  });
});

// CUSTOMER xem đơn của mình; ADMIN xem tất cả.
router.get("/", async (req, res) => {
  const pageText = req.query.page ?? "1";

  if (typeof pageText !== "string" || !/^[1-9]\d*$/.test(pageText)) {
    return res.status(400).json({ message: "page không hợp lệ" });
  }

  const page = Number(pageText);

  if (!Number.isSafeInteger(page) || page > 1000000) {
    return res.status(400).json({ message: "page quá lớn" });
  }

  const where =
    req.user.role.rolename === "ADMIN" ? {} : { uid: req.user.uid };

  const orders = await prisma.order.findMany({
    where,
    include: orderInclude,
    orderBy: { oid: "desc" },
    skip: (page - 1) * 20,
    take: 20,
  });

  return res.status(200).json({ page, pageSize: 20, orders });
});

// Xem chi tiết đơn, có kiểm tra chủ sở hữu.
router.get("/:oid", async (req, res) => {
  const oid = Number(req.params.oid);

  if (!/^[1-9]\d*$/.test(req.params.oid) || !positiveInt(oid)) {
    return res.status(400).json({
      message: "Mã đơn hàng phải là số nguyên dương hợp lệ",
    });
  }

  const order = await prisma.order.findFirst({
    where: {
      oid,
      ...(req.user.role.rolename === "ADMIN"
        ? {}
        : { uid: req.user.uid }),
    },
    include: orderInclude,
  });

  if (!order) {
    return res.status(404).json({
      message: "Không tìm thấy đơn hàng",
    });
  }

  return res.status(200).json({ order });
});

router.use((error, req, res, next) => {
  if (error.status === 409) {
    return res.status(409).json({ message: error.message });
  }

  if (error.code === "P2034") {
    return res.status(409).json({
      message: "Dữ liệu đang được cập nhật đồng thời, vui lòng thử lại",
    });
  }

  console.error("Lỗi API đơn hàng:", error.message);

  return res.status(500).json({
    message: "Lỗi hệ thống, vui lòng thử lại sau",
  });
});

export default router;
