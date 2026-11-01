import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashPassword, isAcceptablePassword } from '../src/infrastructure/security/password.js';

const databaseUrl = process.env.DATABASE_URL;
const seedPassword = process.env.SGRS_SEED_PASSWORD;

if (!databaseUrl) throw new Error('DATABASE_URL is required to seed SGRS.');
if (!seedPassword || !isAcceptablePassword(seedPassword)) {
  throw new Error(
    'Set SGRS_SEED_PASSWORD to a local-only value of 12+ characters and at most 72 UTF-8 bytes before seeding.',
  );
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });
const passwordHash = await hashPassword(seedPassword);

const users = [
  {
    email: 'aditi.rao@student.demo.sgrs.local',
    name: 'Aditi Rao',
    role: 'STUDENT' as const,
    departmentCode: 'STUDENT',
  },
  {
    email: 'ramesh.kumar@staff.demo.sgrs.local',
    name: 'Ramesh Kumar',
    role: 'HANDLER' as const,
    departmentCode: 'HOSTEL',
  },
  {
    email: 'hostel.committee@staff.demo.sgrs.local',
    name: 'Hostel Affairs Committee',
    role: 'REVIEWER' as const,
    departmentCode: 'HOSTEL',
  },
  {
    email: 'admin@demo.sgrs.local',
    name: 'System Administrator',
    role: 'ADMINISTRATOR' as const,
    departmentCode: 'ADMIN',
  },
  {
    email: 'management@demo.sgrs.local',
    name: 'Institute Management',
    role: 'MANAGEMENT' as const,
    departmentCode: 'MANAGEMENT',
  },
];

async function main(): Promise<void> {
  const departments = [
    { code: 'STUDENT', name: 'Students' },
    { code: 'HOSTEL', name: 'Hostel Affairs' },
    { code: 'ADMIN', name: 'Administration' },
    { code: 'MANAGEMENT', name: 'Institute Management' },
    { code: 'ACADEMIC', name: 'Academic Affairs' },
    { code: 'REGISTRAR', name: 'Registrar Office' },
    { code: 'WELFARE', name: 'Student Welfare' },
  ];
  for (const department of departments) {
    await prisma.department.upsert({
      where: { code: department.code },
      update: {},
      create: department,
    });
  }

  for (const user of users) {
    const department = await prisma.department.findUniqueOrThrow({
      where: { code: user.departmentCode },
    });
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, departmentId: department.id, isActive: true },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: department.id,
        passwordHash,
        isActive: true,
      },
    });
  }

  const categorySlaHours = [
    ['Academic', 120],
    ['Administrative', 120],
    ['Hostel/Infrastructure', 120],
    ['Interpersonal', 72],
    ['Other', 120],
  ] as const;
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@demo.sgrs.local' } });
  for (const [name, slaHours] of categorySlaHours) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, slaHours, createdById: admin.id },
    });
  }

  const handler = await prisma.user.findUniqueOrThrow({
    where: { email: 'ramesh.kumar@staff.demo.sgrs.local' },
  });
  const reviewer = await prisma.user.findUniqueOrThrow({
    where: { email: 'hostel.committee@staff.demo.sgrs.local' },
  });
  const hostel = await prisma.category.findUniqueOrThrow({
    where: { name: 'Hostel/Infrastructure' },
  });
  const activeHostelHandler = await prisma.categoryHandler.findFirst({
    where: { categoryId: hostel.id, handlerId: handler.id, activeTo: null },
    select: { id: true },
  });
  if (activeHostelHandler) {
    await prisma.categoryHandler.update({
      where: { id: activeHostelHandler.id },
      data: { isPrimary: true },
    });
  } else {
    await prisma.categoryHandler.create({
      data: {
        categoryId: hostel.id,
        handlerId: handler.id,
        isPrimary: true,
        createdById: admin.id,
      },
    });
  }
  await prisma.category.update({
    where: { id: hostel.id },
    data: { primaryHandlerId: handler.id },
  });
  await prisma.escalationRule.upsert({
    where: { categoryId_level: { categoryId: hostel.id, level: 1 } },
    update: { reviewerId: reviewer.id, isActive: true },
    create: { categoryId: hostel.id, level: 1, reviewerId: reviewer.id, createdById: admin.id },
  });
}

try {
  await main();
  console.log('Synthetic SGRS users, categories, and sample mappings are seeded.');
} finally {
  await prisma.$disconnect();
}
