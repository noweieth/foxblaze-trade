import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findByTelegramId(telegramId: bigint): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { telegramId },
    });
  }

  async findOrCreate(telegramId: bigint, username?: string, firstName?: string): Promise<User> {
    return this.prisma.user.upsert({
      where: { telegramId },
      update: {
        username,
        firstName,
      },
      create: {
        telegramId,
        username,
        firstName,
      },
    });
  }

  async findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }
}
