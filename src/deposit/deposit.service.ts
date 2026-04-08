import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { AutoDepositJob } from './deposit.types';

@Injectable()
export class DepositService implements OnModuleInit {
  private readonly logger = new Logger(DepositService.name);
  private provider!: ethers.JsonRpcProvider;
  private usdcContract!: ethers.Contract;

  private readonly USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Arbitrum Native USDC
  private readonly USDC_ABI = [
    "function balanceOf(address owner) view returns (uint256)"
  ];

  constructor(
    @InjectQueue('deposit_queue') private readonly depositQueue: Queue,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const rpcUrl = this.config.get<string>('ARBITRUM_RPC_URL') || 'https://arb1.arbitrum.io/rpc';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.usdcContract = new ethers.Contract(this.USDC_ADDRESS, this.USDC_ABI, this.provider);
  }

  // Manual scan function when user clicks button
  async checkUserDeposit(userId: number, address: string): Promise<{ success: boolean; amount: number; message: string }> {
    try {
      const balanceBigInt = await this.usdcContract.balanceOf(address);
      const balanceNum = Number(ethers.formatUnits(balanceBigInt, 6));

      if (balanceNum >= 1.0) {
        this.logger.log(`[Manual Scan] Detected ${balanceNum} USDC for User ${userId}`);
        
        await this.depositQueue.add('AUTO_DEPOSIT', {
          userId: userId,
          userAddress: address
        } as AutoDepositJob, {
          jobId: `deposit_${userId}_${address}_${balanceBigInt.toString()}` // Safe dedup
        });

        return { success: true, amount: balanceNum, message: 'Success' };
      }
      
      return { success: false, amount: balanceNum, message: 'Insufficient balance (needs > 1.0 USDC)' };
    } catch (err: any) {
      this.logger.error(`[Manual Scan Error] ${err.message}`);
      return { success: false, amount: 0, message: 'Network infrastructure error' };
    }
  }
}
