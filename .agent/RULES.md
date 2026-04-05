# FoxBlaze — Agent Rules

> Đây là bộ quy tắc bắt buộc khi code trong workspace agent-foxblaze.
> Agent PHẢI đọc file này trước khi viết bất kỳ dòng code nào.

---

## 1. Nguyên tắc chung

### 1.1 Quy trình làm việc
- Chỉ code **một task** tại một thời điểm (theo task.md)
- KHÔNG được code trước các task chưa đến lượt
- KHÔNG sửa code của module khác nếu không thuộc task hiện tại
- Mỗi task phải kết thúc bằng `npm run build` pass thành công
- DỪNG LẠI và chờ user confirm trước khi bắt đầu task tiếp

### 1.2 Code style
- TypeScript strict mode — KHÔNG dùng `any` trừ khi parse response từ external API
- Tên file: `kebab-case` (vd: `hl-info.service.ts`)
- Tên class: `PascalCase` (vd: `HlInfoService`)
- Tên method/variable: `camelCase`
- KHÔNG thêm comments thừa — code phải tự giải thích
- KHÔNG thêm TODO, FIXME trừ khi có lý do cụ thể
- KHÔNG thêm console.log debug — dùng NestJS Logger

### 1.3 Minimal changes
- CHỈ viết code cần thiết cho task hiện tại
- KHÔNG refactor code hiện có trừ khi task yêu cầu
- KHÔNG thêm error handling quá mức — xử lý đủ dùng
- KHÔNG tạo abstraction mới nếu chỉ dùng 1 chỗ

---

## 2. NestJS Patterns

### 2.1 Module structure
Mỗi module gồm tối đa 3 loại file:
```
module-name/
├── module-name.module.ts      # Module definition
├── module-name.service.ts     # Business logic
└── module-name.processor.ts   # BullMQ worker (nếu có)
```

### 2.2 Dependency Injection
- Dùng constructor injection, KHÔNG dùng `@Inject()` trừ khi inject token
- Module phải export service nếu module khác cần dùng
- Tránh circular dependency — nếu A cần B và B cần A → tách logic chung ra common

### 2.3 Module imports
```typescript
@Module({
  imports: [PrismaModule, ConfigModule],  // Chỉ import module cần thiết
  providers: [MyService],
  exports: [MyService],                   // Export nếu module khác cần
})
export class MyModule {}
```

### 2.4 Config access
```typescript
// ĐÚNG: inject ConfigService
constructor(private config: ConfigService) {}
const key = this.config.get<string>('ENCRYPTION_KEY');

// SAI: process.env trực tiếp
const key = process.env.ENCRYPTION_KEY;  // ❌ KHÔNG LÀM THẾ NÀY
```

---

## 3. Database (Prisma)

### 3.1 Schema conventions
- Model name: `PascalCase` singular (User, Wallet, Trade, Deposit)
- Field name: `camelCase`
- Relation: dùng `@relation` explicit
- Index: thêm `@@index` cho query patterns thường dùng

### 3.2 Prisma usage
```typescript
// ĐÚNG: inject PrismaService
constructor(private prisma: PrismaService) {}

// Query patterns
await this.prisma.user.findUnique({ where: { telegramId } });
await this.prisma.wallet.create({ data: { ... } });
```

### 3.3 BigInt handling
- `telegramId` là BigInt trong Prisma
- Khi nhận từ Telegram: `BigInt(ctx.from.id)`
- Khi trả về JSON: `.toString()` để serialize

---

## 4. Redis Cache

### 4.1 Cache pattern (bắt buộc cho HL API)
```typescript
// Generic cache wrapper — PHẢI dùng cho mọi HL API call
private async cachedQuery<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await this.redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const data = await fetcher();
  await this.redis.setex(key, ttl, JSON.stringify(data));
  return data;
}
```

### 4.2 Cache keys & TTLs
| Data | Key Pattern | TTL |
|:---|:---|:---|
| Assets metadata | `hl:assets` | 300s |
| Positions | `hl:pos:{address}` | 5s |
| Open orders | `hl:orders:{address}` | 5s |
| Account state | `hl:account:{address}` | 5s |
| User fills | `hl:fills:{address}` | 30s |
| Session FSM | `session:{telegramId}` | 300s |

### 4.3 Cache invalidation
- SAU mỗi trade/cancel/close thành công → xóa cache:
```typescript
async invalidateUserCache(address: string): Promise<void> {
  await this.redis.del(`hl:pos:${address}`, `hl:orders:${address}`, `hl:account:${address}`);
}
```

---

## 5. Hyperliquid Integration

### 5.1 SDK usage
```typescript
import * as hl from '@nktkas/hyperliquid';

// Info (read)
const infoClient = new hl.InfoClient({ transport: new hl.HttpTransport() });

// Exchange (write) — cần wallet
const exchangeClient = new hl.ExchangeClient({ 
  transport: new hl.HttpTransport(),
  wallet: viemAccount
});
```

### 5.2 Signing rules
| Action | Signed by | Khi nào |
|:---|:---|:---|
| createSubAccount | MASTER wallet | Onboarding |
| subAccountTransfer | MASTER wallet | Deposit/Withdraw |
| acceptTerms | USER's derived wallet | Onboarding |
| approveAgent | USER's derived wallet | Onboarding |
| setReferrer | USER's derived wallet | Onboarding |
| approveBuilderFee | USER's derived wallet | Onboarding |
| placeOrder, cancel, TP/SL | AGENT wallet + vaultAddress | Trading |

### 5.3 Builder fee (bắt buộc trên mọi order)
```typescript
// Mọi order PHẢI kèm builder param
await exchangeClient.order({
  orders: [{ ... }],
  builder: {
    b: MASTER_ADDRESS.toLowerCase(),  // Phải lowercase
    f: 15                              // 15 tenths bps = 0.015%
  }
});
```

### 5.4 Price formatting
- Hyperliquid yêu cầu price có tối đa **5 significant figures**
- Size phải theo `szDecimals` của asset
- Notional (size × price) phải >= $10

### 5.5 Rate limits
- 1200 weight/phút/IP
- `clearinghouseState` = weight 2
- Standard info = weight 20
- **LUÔN dùng Redis cache** — KHÔNG gọi HL API trực tiếp trong handler

---

## 6. Security

### 6.1 Private key handling
```typescript
// ĐÚNG: Encrypt trước khi lưu DB
const encrypted = this.encryption.encrypt(privateKey);
await this.prisma.wallet.create({ data: { encryptedPrivateKey: encrypted } });

// ĐÚNG: Decrypt chỉ khi cần dùng, không cache trong memory
const key = this.encryption.decrypt(wallet.encryptedPrivateKey);
// ... use key ...
// key sẽ bị GC thu hồi sau khi hết scope
```

### 6.2 Encryption format
- Algorithm: AES-256-GCM
- Output format: `{iv_hex}:{authTag_hex}:{ciphertext_hex}`
- Key: 32 bytes (64 hex chars) từ env `ENCRYPTION_KEY`

### 6.3 HD Wallet derivation
- Path: `m/44'/60'/0'/0/{index}` (BIP44 standard)
- Seed phrase: env `MASTER_SEED_PHRASE` (12 hoặc 24 words)
- Index = user's `derivationIndex` trong DB (auto-increment)

### 6.4 KHÔNG BAO GIỜ:
- Log private key ra console/file
- Trả private key qua API/Telegram
- Lưu private key dạng plain text trong DB
- Hardcode seed phrase hay private key trong code

---

## 7. Gasless Deposit (EIP-2612 Permit)

### 7.1 Flow
```
User gửi USDC → ví 0xUSER (Arbitrum)
  → Poll phát hiện balance > 0
  → Derive user private key → Ký Permit off-chain (FREE)
  → Relayer gọi batchedDepositWithPermit (relayer trả gas)
  → Bridge credit USDC vào HL
  → subAccountTransfer vào sub-account
  → Notify user
```

### 7.2 Contract addresses (Arbitrum Mainnet)
```typescript
const USDC_ADDRESS    = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const BRIDGE_ADDRESS  = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';
```

### 7.3 EIP-712 Permit domain
```typescript
const domain = {
  name: 'USD Coin',
  version: '2',
  chainId: 42161,
  verifyingContract: USDC_ADDRESS
};
```

---

## 8. BullMQ Patterns

### 8.1 Queue configuration
```typescript
// trade_queue: concurrency 5, retry 2 lần
// deposit_queue: concurrency 3, retry 3 lần
{
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50
  }
}
```

### 8.2 Job types
| Queue | Job Name | Data |
|:---|:---|:---|
| trade_queue | OPEN_POSITION | { userId, asset, side, size, leverage, tp?, sl? } |
| trade_queue | CLOSE_POSITION | { userId, asset, size, side } |
| trade_queue | SET_TP_SL | { userId, tradeId, tp?, sl? } |
| deposit_queue | AUTO_DEPOSIT | { userId, walletAddress, amount } |

### 8.3 Error handling trong processor
```typescript
// Log error nhưng KHÔNG throw nếu có thể retry
// BullMQ sẽ tự retry theo config
@Process('OPEN_POSITION')
async handle(job: Job) {
  try {
    // ... execute
  } catch (error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
    throw error;  // Throw để BullMQ retry
  }
}
```

---

## 9. Telegram Bot (grammY)

### 9.1 Bot lifecycle
```typescript
// Dev: polling
// Prod: webhook (future)
if (NODE_ENV === 'development') {
  bot.start();  // Long polling
}
```

### 9.2 FSM States
```
IDLE → /long or /short
  → AWAITING_ASSET → nhập tên coin
  → AWAITING_SIZE → nhập USDC amount
  → AWAITING_LEVERAGE → chọn leverage
  → AWAITING_TP → nhập TP price hoặc /skip
  → AWAITING_SL → nhập SL price hoặc /skip
  → AWAITING_CONFIRM → ✅ Xác nhận / ❌ Hủy
```

### 9.3 Message format
- Parse mode: `HTML`
- Dùng `<b>bold</b>` cho tiêu đề
- Dùng `<code>address</code>` cho mã/address
- Emoji prefix cho status: ✅ thành công, ❌ lỗi, ⏳ đang xử lý, ⚠️ cảnh báo

### 9.4 Error handling
- BẤT KỲ error nào → gửi message thân thiện cho user
- Log error detail bằng NestJS Logger
- KHÔNG gửi stack trace cho user

---

## 10. Environment Variables

```env
# Telegram
TELEGRAM_BOT_TOKEN=                    # Required
NODE_ENV=development                   # development | production

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/foxblaze

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Security
MASTER_SEED_PHRASE=                     # Required: BIP39 12/24 words
ENCRYPTION_KEY=                         # Required: 64 hex chars

# Hyperliquid
HYPERLIQUID_MASTER_ADDRESS=0x9b5048Cb54407eb1871727fbE91d83c5E2816068
HYPERLIQUID_MASTER_KEY=                 # Required: master private key

# Revenue
BUILDER_FEE_RATE=0.015%
BUILDER_FEE_TENTHS_BPS=15
REFERRAL_CODE=                          # Required: HL referral code of master

# Arbitrum (Gasless Deposit)
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
RELAYER_PRIVATE_KEY=                    # Required: wallet with ETH on Arbitrum
DEPOSIT_POLL_INTERVAL_MS=15000
```

---

## 11. Reference Documents

- **Implementation Plan**: `/Users/vinhlam/.gemini/antigravity/brain/6d9f8a7c-2d6f-49eb-a3ea-fb08c7c9d6ec/implementation_plan.md`
- **Task List**: `/Users/vinhlam/.gemini/antigravity/brain/6d9f8a7c-2d6f-49eb-a3ea-fb08c7c9d6ec/task.md`
- **GiWei Reference** (deposit flow): `/Users/vinhlam/workspace/bot/giwei-server-bot/apps/trade-worker/src/deposit.processor.ts`
- **GiWei Reference** (signing service): `/Users/vinhlam/workspace/bot/giwei-server-bot/apps/signing-service/src/signing-service.service.ts`
