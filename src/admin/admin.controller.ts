import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('insights')
  async getInsights() {
    return this.adminService.getInsights();
  }

  @Post('broadcast')
  async broadcast(@Body('message') message: string) {
    if (!message) return { status: 'error', message: 'No content' };
    return this.adminService.broadcast(message);
  }

  @Post('system/toggle')
  async toggleSystem() {
    return this.adminService.toggleSystem();
  }

  @Get('tables/:type')
  async getTableData(@Param('type') type: string) {
    const data = await this.adminService.getTableData(type);
    return { status: 'success', data };
  }
}
