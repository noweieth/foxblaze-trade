import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
// @ts-ignore
import basicAuth from 'express-basic-auth';

@Injectable()
export class AdminAuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const user = process.env.ADMIN_USER || 'admin';
    const pass = process.env.ADMIN_PASS || 'foxblaze123';

    const authMiddleware = basicAuth({
      users: { [user]: pass },
      challenge: true,
      realm: 'FoxBlaze Admin Area',
    });

    authMiddleware(req, res, next);
  }
}
