/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const fleet = await prisma.fleet.upsert({
    where: { id: 'pacific-eld' },
    update: {},
    create: { id: 'pacific-eld', name: 'Pacific ELD' },
  });

  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'change_me_in_prod';
  await prisma.user.upsert({
    where: { email: 'admin@pacificeld.com' },
    update: {},
    create: {
      fleetId: fleet.id,
      email: 'admin@pacificeld.com',
      passwordHash: await bcrypt.hash(adminPassword, 10),
      name: 'Pacific ELD Admin',
      role: 'ADMIN',
    },
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { id: 'demo-vehicle-1' },
    update: {},
    create: {
      id: 'demo-vehicle-1',
      fleetId: fleet.id,
      name: 'Demo Vehicle 1',
      make: 'Geometris',
      model: 'Test',
      year: 2024,
    },
  });

  await prisma.device.upsert({
    where: { serialNumber: '88X150380033' },
    update: { fleetId: fleet.id, vehicleId: vehicle.id },
    create: {
      fleetId: fleet.id,
      serialNumber: '88X150380033',
      model: 'whereQube-OBD',
      status: 'ACTIVE',
      vehicleId: vehicle.id,
    },
  });

  await prisma.driver.upsert({
    where: { id: 'demo-driver-1' },
    update: {},
    create: {
      id: 'demo-driver-1',
      fleetId: fleet.id,
      name: 'Demo Driver',
      email: 'driver@pacificeld.com',
    },
  });

  console.log('Seed complete.');
  console.log(`Admin login: admin@pacificeld.com / ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
