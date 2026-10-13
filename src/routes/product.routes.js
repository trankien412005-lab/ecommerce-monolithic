import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";

const router = Router();

// Kiểm tra mã sản phẩm trên URL.
router.param("pid", (req, res, next, value) => {
  const pid = Number(value);

  if (
    !/^[1-9]\d*$/.test(value) ||
    !Number.isInteger(pid) ||
    pid > 2147483647
  ) {
    return res.status(400).json({
      message: "Mã sản phẩm phải là số nguyên dương hợp lệ",
    });
  }

  req.productId = pid;
  return next();
});

// Kiểm tra dữ liệu dùng chung cho thêm và sửa.
function validateProduct(req, res, next) {
  const { pname, price, quantity } = req.body ?? {};

  if (
    typeof pname !== "string" ||
    !pname.trim() ||
    pname.trim().length > 100
  ) {
    return res.status(400).json({
      message: "Tên sản phẩm không được trống và tối đa 100 ký tự",
    });
  }

  if (typeof price !== "string" && typeof price !== "number") {
    return res.status(400).json({
      message: "Giá sản phẩm phải là số hoặc chuỗi số",
    });
  }

  const priceText = String(price);

  if (
    !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(priceText) ||
    Number(priceText) <= 0
  ) {
    return res.status(400).json({
      message: "Giá phải lớn hơn 0, tối đa 99999999.99 và tối đa 2 số thập phân",
    });
  }

  if (
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    quantity > 2147483647
  ) {
    return res.status(400).json({
      message: "Số lượng phải là số nguyên từ 0 đến 2147483647",
    });
  }

  req.productData = {
    pname: pname.trim(),
    price: new Prisma.Decimal(priceText),
    quantity,
  };

  return next();
}

// Danh sách tối đa 100 sản phẩm mới nhất.
router.get("/", async (req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { pid: "desc" },
    take: 100,
  });

  return res.status(200).json({ products });
});

// Chi tiết sản phẩm.
router.get("/:pid", async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { pid: req.productId },
  });

  if (!product) {
    return res.status(404).json({
      message: "Không tìm thấy sản phẩm",
    });
  }

  return res.status(200).json({ product });
});

// Thêm sản phẩm.
router.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  validateProduct,
  async (req, res) => {
    const product = await prisma.product.create({
      data: req.productData,
    });

    return res.status(201).json({
      message: "Thêm sản phẩm thành công",
      product,
    });
  }
);

// Sửa đầy đủ tên, giá và số lượng.
router.put(
  "/:pid",
  requireAuth,
  requireRole("ADMIN"),
  validateProduct,
  async (req, res) => {
    const product = await prisma.product.update({
      where: { pid: req.productId },
      data: req.productData,
    });

    return res.status(200).json({
      message: "Cập nhật sản phẩm thành công",
      product,
    });
  }
);

// Xóa sản phẩm chưa được tham chiếu trong đơn hàng.
router.delete(
  "/:pid",
  requireAuth,
  requireRole("ADMIN"),
  async (req, res) => {
    await prisma.product.delete({
      where: { pid: req.productId },
    });

    return res.status(204).send();
  }
);

// Xử lý lỗi database.
router.use((error, req, res, next) => {
  if (error.code === "P2025") {
    return res.status(404).json({
      message: "Không tìm thấy sản phẩm",
    });
  }

  if (error.code === "P2003") {
    return res.status(409).json({
      message: "Không thể xóa sản phẩm đã có trong đơn hàng",
    });
  }

  console.error("Lỗi API sản phẩm:", error.message);

  return res.status(500).json({
    message: "Lỗi hệ thống, vui lòng thử lại sau",
  });
});

export default router;
