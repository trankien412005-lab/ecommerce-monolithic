import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(requireAuth);

// Chỉ ADMIN được tạo và cập nhật vận chuyển.
router.use((req, res, next) => {
  if (req.user.role.rolename !== "ADMIN") {
    return res.status(403).json({
      message: "Bạn không có quyền thực hiện chức năng này",
    });
  }

  return next();
});

function positiveInt(value) {
  return Number.isInteger(value) && value > 0 && value <= 2147483647;
}

// Tạo vận chuyển, luôn bắt đầu ở PENDING.
router.post("/", async (req, res) => {
  const oid = req.body?.oid;

  if (!positiveInt(oid)) {
    return res.status(400).json({
      message: "oid phải là số nguyên dương hợp lệ",
    });
  }

  const order = await prisma.order.findUnique({
    where: { oid },
    select: { oid: true },
  });

  if (!order) {
    return res.status(404).json({
      message: "Không tìm thấy đơn hàng",
    });
  }

  const shipment = await prisma.shipment.create({
    data: { oid, status: "PENDING" },
  });

  return res.status(201).json({
    message: "Tạo vận chuyển thành công",
    shipment,
  });
});

// Cập nhật trạng thái theo thứ tự.
router.patch("/:shipid/status", async (req, res) => {
  const shipid = Number(req.params.shipid);
  const status = req.body?.status;

  if (!/^[1-9]\d*$/.test(req.params.shipid) || !positiveInt(shipid)) {
    return res.status(400).json({
      message: "Mã vận chuyển không hợp lệ",
    });
  }

  if (!["SHIPPING", "DELIVERED"].includes(status)) {
    return res.status(400).json({
      message: "Trạng thái cập nhật phải là SHIPPING hoặc DELIVERED",
    });
  }

  const shipment = await prisma.shipment.findUnique({
    where: { shipid },
  });

  if (!shipment) {
    return res.status(404).json({
      message: "Không tìm thấy vận chuyển",
    });
  }

  const previousStatus =
    status === "SHIPPING" ? "PENDING" : "SHIPPING";

  if (shipment.status !== previousStatus) {
    return res.status(409).json({
      message: "Chỉ được chuyển PENDING -> SHIPPING -> DELIVERED",
    });
  }

  // Điều kiện trạng thái tránh ghi đè cập nhật đồng thời.
  const result = await prisma.shipment.updateMany({
    where: { shipid, status: previousStatus },
    data: { status },
  });

  if (result.count !== 1) {
    return res.status(409).json({
      message: "Trạng thái đã thay đổi, vui lòng tải lại",
    });
  }

  return res.status(200).json({
    message: "Cập nhật trạng thái vận chuyển thành công",
    shipment: {
      shipid: shipment.shipid,
      oid: shipment.oid,
      status,
    },
  });
});

router.use((error, req, res, next) => {
  if (error.code === "P2003") {
    return res.status(409).json({
      message: "Đơn hàng tham chiếu không còn tồn tại",
    });
  }

  console.error("Lỗi API vận chuyển:", error.message);

  return res.status(500).json({
    message: "Lỗi hệ thống, vui lòng thử lại sau",
  });
});

export default router;
