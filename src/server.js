import shipmentRoutes from "./routes/shipment.routes.js";
import orderRoutes from "./routes/order.routes.js";
import productRoutes from "./routes/product.routes.js";
import authRoutes from "./routes/auth.routes.js";
import express from "express";
import { prisma } from "./lib/prisma.js";

const app = express();
const PORT = Number(process.env.PORT);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT trong file .env phải là số từ 1 đến 65535");
}

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/shipments", shipmentRoutes);

app.get("/", (req, res) => {
  res.status(200).json({
    message: "E-commerce Monolithic API đang chạy",
  });
});

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: "ok",
      service: "ecommerce-monolithic",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check thất bại:", error.message);

    res.status(503).json({
      status: "error",
      service: "ecommerce-monolithic",
      database: "disconnected",
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    message: "Không tìm thấy API",
  });
});

async function start() {
  try {
    await prisma.$connect();
    console.log("Đã kết nối PostgreSQL");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server đang chạy tại http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Khởi động thất bại:", error.message);
    await prisma.$disconnect();
    process.exitCode = 1;
  }
}

start();
