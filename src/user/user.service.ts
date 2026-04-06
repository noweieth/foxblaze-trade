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

  async activatePremium(telegramId: bigint): Promise<User> {
    return this.prisma.user.update({
      where: { telegramId },
      data: {
        isPremium: true,
        premiumAt: new Date(),
      },
    });
  }

  async getPremiumUsers(): Promise<User[]> {
    return this.prisma.user.findMany({
      where: {
        isPremium: true,
        isActive: true,
      },
      include: {
        wallet: true,
      },
    });
  }

  async setAutoCopy(telegramId: bigint, enabled: boolean): Promise<User> {
    return this.prisma.user.update({
      where: { telegramId },
      data: { autoCopy: enabled },
    });
  }

  async setCopySize(telegramId: bigint, size: number): Promise<User> {
    if (size < 5) throw new Error("Copy size must be at least $5");
    return this.prisma.user.update({
      where: { telegramId },
      data: { copySize: size },
    });
  }
}
