import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('insights')
  async getInsights() {
    return this.adminService.getInsights();
  }

  @Get('analytics')
  async getAnalytics() {
    return this.adminService.getAnalytics();
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

  @Get('stats/users-chart')
  async getUsersChart(@Query('range') range: string) {
    return this.adminService.getUsersChartData(range || '7d');
  }

  @Get('users')
  async getUsers(@Query('page') page: string, @Query('search') search: string) {
    return this.adminService.getUsers(parseInt(page) || 1, search);
  }
  
  @Get('users/:id')
  async getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(parseInt(id));
  }
  
  @Get('users/:id/balance')
  async getUserBalance(@Param('id') id: string) {
    return this.adminService.getUserBalance(parseInt(id));
  }
  
  @Post('users/:id/message')
  async sendUserMessage(@Param('id') id: string, @Body('message') message: string) {
    return this.adminService.sendUserMessage(parseInt(id), message);
  }
  
  @Post('users/:id/toggle-active')
  async toggleUserActive(@Param('id') id: string) {
    return this.adminService.toggleUserActive(parseInt(id));
  }
  
  @Get('positions/all')
  async getAllOpenPositions() {
    return this.adminService.getAllOpenPositions();
  }

  @Get('health')
  async getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  @Get('config')
  async getRuntimeConfig() {
    return this.adminService.getRuntimeConfig();
  }

  @Post('config')
  async updateRuntimeConfig(@Body() body: any) {
    return this.adminService.updateRuntimeConfig(body);
  }

  @Post('emergency/close-all')
  async emergencyCloseAll() {
    return this.adminService.emergencyCloseAll();
  }
}
