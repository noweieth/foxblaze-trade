import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { WalletService } from '../wallet/wallet.service';
import { HlExchangeService } from '../hyperliquid/hl-exchange.service';
import { PrismaService } from '../prisma/prisma.service';
import { AutoDepositJob } from './deposit.types';

@Processor('deposit_queue', { concurrency: 2 })
export class DepositProcessor extends WorkerHost {
  private readonly logger = new Logger(DepositProcessor.name);
  
  private provider!: ethers.JsonRpcProvider;
  private relayerWallet!: ethers.Wallet;
  private usdcContract!: ethers.Contract;

  private readonly USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
  private readonly HL_BRIDGE_ADDRESS = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';

  private readonly USDC_ABI = [
    "function balanceOf(address owner) view returns (uint256)"
  ];

  constructor(
    private readonly config: ConfigService,
    private readonly walletService: WalletService,
    private readonly hlExchange: HlExchangeService,
    private readonly prisma: PrismaService,
  ) {
    super();
    this.initContracts();
  }

  private initContracts() {
    const rpcUrl = this.config.get<string>('ARBITRUM_RPC_URL') || 'https://arb1.arbitrum.io/rpc';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const relayerKey = this.config.get<string>('RELAYER_PRIVATE_KEY');
    if (relayerKey) {
      this.relayerWallet = new ethers.Wallet(relayerKey, this.provider);
    }
    
    this.usdcContract = new ethers.Contract(this.USDC_ADDRESS, this.USDC_ABI, this.provider);
  }

  async process(job: Job<AutoDepositJob, any, string>): Promise<any> {
    this.logger.log(`[Worker] Start Deposit EIP-2612 Gasless Job: ${job.id}`);
    
    if (job.name === 'AUTO_DEPOSIT') {
      return this.handleAutoDeposit(job.data);
    }
  }

  private async handleAutoDeposit(data: AutoDepositJob) {
    if (!this.relayerWallet) {
       this.logger.warn(`RELAYER_PRIVATE_KEY not set. Skipping auto deposit.`);
       return;
    }

    const { userId, userAddress } = data;
    
    // 1. Re-check double processing
    const balanceBigInt = await this.usdcContract.balanceOf(userAddress);
    if (balanceBigInt === 0n) return;
    
    const amount = Number(ethers.formatUnits(balanceBigInt, 6));
    this.logger.log(`[Worker] Gasless Deposit for User ${userId}. USDC Amount: ${amount}`);

    const userPrivateKey = await this.walletService.getDecryptedPrivateKey(userId);
    const userWallet = new ethers.Wallet(userPrivateKey, this.provider);
    
    try {
      this.logger.log(`[Worker] Fund L1 Gas Fee for User ${userId}`);
      const ethBalance = await this.provider.getBalance(userAddress);
      
      if (ethBalance < ethers.parseEther("0.0001")) {
         const fundTx = await this.relayerWallet.sendTransaction({
            to: userAddress,
            value: ethers.parseEther("0.00015")
         });
         await fundTx.wait();
      }

      this.logger.log(`[Worker] Trigger User ${userId} to transfer USDC directly to L1 Bridge...`);
      const usdcWithUser = new ethers.Contract(this.USDC_ADDRESS, ["function transfer(address, uint256) returns(bool)"], userWallet);
      
      const tx = await usdcWithUser.transfer(this.HL_BRIDGE_ADDRESS, balanceBigInt);
      this.logger.log(`[Worker] Waiting for L1 TX confirmation: ${tx.hash}`);
      await tx.wait();

      await this.prisma.deposit.create({
        data: {
          userId,
          amount: amount,
          txHash: tx.hash, 
          status: 'COMPLETED'
        }
      });
      
      // Re-trigger HL Onboarding after funding
      const wallet = await this.walletService.getWalletByUserId(userId);
      if (wallet && !wallet.isHlRegistered) {
         await this.walletService.activateHlAccount(userId, userPrivateKey, wallet.agentAddress);
      }

      this.logger.log(`✅ [Worker] Auto deposit successful. $${amount} available reported!`);
    } catch (err: any) {
      this.logger.error(`[Worker] L1 Deposit Error: ${err.message}`);
      throw err;
    }
  }
}
