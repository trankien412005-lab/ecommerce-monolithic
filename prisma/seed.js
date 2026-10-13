import { prisma } from "../src/lib/prisma.js";

async function main() {
  await prisma.$transaction([
    prisma.role.upsert({
      where: { rolename: "ADMIN" },
      update: {},
      create: { rolename: "ADMIN" },
    }),
    prisma.role.upsert({
      where: { rolename: "CUSTOMER" },
      update: {},
      create: { rolename: "CUSTOMER" },
    }),
    prisma.memberShip.upsert({
      where: { mname: "BASIC" },
      update: {},
      create: {
        mname: "BASIC",
        score: 0,
      },
    }),
  ]);

  console.log("Đã tạo dữ liệu ban đầu.");
  console.table(await prisma.role.findMany());
  console.table(await prisma.memberShip.findMany());
}

try {
  await main();
} catch (error) {
  console.error("Tạo dữ liệu thất bại:", error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
