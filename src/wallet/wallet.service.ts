import { Injectable, OnModuleInit, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionUtil } from '../common/encryption.util';
import { HDNodeWallet, Wallet as EthersWallet, Mnemonic } from 'ethers';
import { HD_PATH_PREFIX } from '../common/constants';
import { Wallet } from '@prisma/client';
import { HlExchangeService } from '../hyperliquid/hl-exchange.service';

@Injectable()
export class WalletService implements OnModuleInit {
  private readonly logger = new Logger(WalletService.name);
  private rootNode!: HDNodeWallet;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionUtil,
    private readonly hlExchange: HlExchangeService,
  ) {}

  onModuleInit() {
    const seedPhrase = this.config.get<string>('MASTER_SEED_PHRASE');
    if (!seedPhrase) {
      throw new InternalServerErrorException('MASTER_SEED_PHRASE is not configured');
    }
    
    try {
      const mnemonic = Mnemonic.fromPhrase(seedPhrase);
      this.rootNode = HDNodeWallet.fromMnemonic(mnemonic, "m");
    } catch (error) {
      throw new InternalServerErrorException('Invalid MASTER_SEED_PHRASE');
    }
  }

  private deriveWallet(index: number): { address: string; privateKey: string } {
    const derived = this.rootNode.derivePath(`${HD_PATH_PREFIX}${index}`);
    return {
      address: derived.address,
      privateKey: derived.privateKey,
    };
  }

  async getNextDerivationIndex(): Promise<number> {
    const maxWallet = await this.prisma.wallet.aggregate({
      _max: {
        derivationIndex: true,
      },
    });
    const maxIndex = maxWallet._max.derivationIndex;
    return maxIndex !== null ? maxIndex + 1 : 0;
  }

  async createWallet(userId: number): Promise<{ address: string; agentAddress: string; derivationIndex: number }> {
    const existingWallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    if (existingWallet) {
      return {
        address: existingWallet.address,
        agentAddress: existingWallet.agentAddress,
        derivationIndex: existingWallet.derivationIndex,
      };
    }

    const index = await this.getNextDerivationIndex();
    const { address, privateKey } = this.deriveWallet(index);
    const encryptedPrivateKey = this.encryption.encrypt(privateKey);

    const agentWallet = EthersWallet.createRandom();
    const agentAddress = agentWallet.address;
    const encryptedAgentKey = this.encryption.encrypt(agentWallet.privateKey);

    const newWallet = await this.prisma.wallet.create({
      data: {
        userId,
        derivationIndex: index,
        address,
        encryptedPrivateKey,
        agentAddress,
        encryptedAgentKey,
      },
    });

    return {
      address: newWallet.address,
      agentAddress: newWallet.agentAddress,
      derivationIndex: newWallet.derivationIndex,
    };
  }

  async getDecryptedPrivateKey(userId: number): Promise<string> {
    const wallet = await this.getWalletByUserId(userId);
    if (!wallet) throw new Error('Wallet not found');
    return this.encryption.decrypt(wallet.encryptedPrivateKey);
  }

  async getDecryptedAgentKey(userId: number): Promise<string> {
    const wallet = await this.getWalletByUserId(userId);
    if (!wallet) throw new Error('Wallet not found');
    return this.encryption.decrypt(wallet.encryptedAgentKey);
  }

  async getWalletByUserId(userId: number): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({
      where: { userId },
    });
  }

  async markHlRegistered(userId: number): Promise<Wallet> {
    return this.prisma.wallet.update({
      where: { userId },
      data: {
        isHlRegistered: true,
      },
    });
  }

  async activateHlAccount(userId: number, userPrivateKey: string, agentAddress: string): Promise<boolean> {
    try {
      this.logger.log(`[Task 8] Accepting terms for user ${userId}`);
      await this.hlExchange.acceptTerms(userPrivateKey).catch(e => this.logger.warn(`Terms: ${e.message}`));
      
      this.logger.log(`[Task 8] Approving agent for user ${userId}`);
      await this.hlExchange.approveAgent(userPrivateKey, agentAddress).catch(e => {
         if (!e.message?.includes('already')) throw e;
         this.logger.warn(`Agent already approved.`);
      });
      
      const referralCode = this.config.get<string>('REFERRAL_CODE');
      if (referralCode) {
        this.logger.log(`[Task 8] Setting Referrer code ${referralCode} for user ${userId}`);
        await this.hlExchange.setReferrer(userPrivateKey, referralCode).catch(e => {
           if (!e.message?.includes('already')) throw e;
           this.logger.warn(`Referrer already set.`);
        });
      }
      
      const builderAddress = this.config.get<string>('HYPERLIQUID_MASTER_ADDRESS');
      if (builderAddress) {
        this.logger.log(`[Task 8] Approving Builder Fee for user ${userId}`);
        await this.hlExchange.approveBuilderFee(userPrivateKey, builderAddress, "0.1%").catch(e => {
           if (!e.message?.includes('already')) throw e;
           this.logger.warn(`Builder Fee already approved.`);
        });
      }
      
      this.logger.log(`[Task 8] Successfully activated HL Account for user ${userId}!`);
      await this.markHlRegistered(userId);
      return true;
    } catch (e: any) {
      if (e.message?.includes('Must deposit')) {
         this.logger.warn(`User ${userId} requires deposit on HL to activate Agent Key.`);
      } else {
         this.logger.error(`Failed to activate HL for user ${userId}: ${e.message}`);
      }
      return false;
    }
  }

  async createWalletAndOnboard(userId: number): Promise<Wallet | null> {
    let wallet = await this.getWalletByUserId(userId);
    if (!wallet) {
      await this.createWallet(userId);
      wallet = await this.getWalletByUserId(userId);
    }

    if (!wallet) return null;

    const userPrivateKey = this.encryption.decrypt(wallet.encryptedPrivateKey);

    // Thử kích hoạt luôn nếu lỡ ví có balance, nếu không thì âm thầm bỏ qua
    await this.activateHlAccount(userId, userPrivateKey, wallet.agentAddress);
    
    // Cập nhật lại state của wallet
    return await this.getWalletByUserId(userId);
  }
}
