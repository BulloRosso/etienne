import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface UserOrder {
  orderId: string;
  sessionId: string;
  projectName: string;
  timestamp: string;
  lastActivity: string;
  type: 'Research' | 'Scheduled Activity' | 'Monitoring';
  title: string;
  description: string;
  status:
    | 'in-progress'
    | 'complete-success'
    | 'complete-failure'
    | 'canceled-by-user'
    | 'canceled-by-agent'
    | 'requires-human-input'
    | 'blocked-by'
    | 'paused';
  statusHistory: Array<{ timestamp: string; statusMessage: string }>;
}

@Injectable()
export class UserOrdersService {
  private readonly logger = new Logger(UserOrdersService.name);
  private readonly workspaceDir = process.env.WORKSPACE_ROOT || '/workspace';

  private get ordersFilePath(): string {
    return path.join(this.workspaceDir, '.etienne', 'user-orders.json');
  }

  async loadOrders(): Promise<UserOrder[]> {
    try {
      if (await fs.pathExists(this.ordersFilePath)) {
        return await fs.readJson(this.ordersFilePath);
      }
    } catch (error: any) {
      this.logger.warn(`Failed to load user orders: ${error.message}`);
    }
    return [];
  }

  async saveOrders(orders: UserOrder[]): Promise<void> {
    await fs.ensureDir(path.dirname(this.ordersFilePath));
    await fs.writeJson(this.ordersFilePath, orders, { spaces: 2 });
  }

  async addOrder(
    sessionId: string,
    projectName: string,
    title: string,
    description: string,
    type: UserOrder['type'] = 'Research',
  ): Promise<UserOrder> {
    const orders = await this.loadOrders();
    const now = new Date().toISOString();

    const order: UserOrder = {
      orderId: randomUUID(),
      sessionId,
      projectName,
      timestamp: now,
      lastActivity: now,
      type,
      title: title.substring(0, 60),
      description: description.substring(0, 2096),
      status: 'in-progress',
      statusHistory: [{ timestamp: now, statusMessage: 'Order created' }],
    };

    orders.push(order);
    await this.saveOrders(orders);
    this.logger.log(`Created user order ${order.orderId} for project ${projectName}`);
    return order;
  }

  async updateOrder(
    orderId: string,
    statusNew: UserOrder['status'],
    statusMessage: string,
  ): Promise<UserOrder | null> {
    const orders = await this.loadOrders();
    const order = orders.find((o) => o.orderId === orderId);
    if (!order) {
      return null;
    }

    const now = new Date().toISOString();
    order.status = statusNew;
    order.lastActivity = now;
    order.statusHistory.push({ timestamp: now, statusMessage });

    await this.saveOrders(orders);
    this.logger.log(`Updated user order ${orderId} to status ${statusNew}`);
    return order;
  }

  async getOrder(orderId: string): Promise<UserOrder | null> {
    const orders = await this.loadOrders();
    return orders.find((o) => o.orderId === orderId) || null;
  }

  async deleteOrder(orderId: string): Promise<boolean> {
    const orders = await this.loadOrders();
    const index = orders.findIndex((o) => o.orderId === orderId);
    if (index === -1) {
      return false;
    }
    orders.splice(index, 1);
    await this.saveOrders(orders);
    this.logger.log(`Deleted user order ${orderId}`);
    return true;
  }

  async getActiveOrders(): Promise<UserOrder[]> {
    const orders = await this.loadOrders();
    return orders
      .filter(
        (o) => !o.status.startsWith('complete-') && !o.status.startsWith('canceled-'),
      )
      .sort(
        (a, b) =>
          new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
      );
  }

  async getHistoryOrders(): Promise<UserOrder[]> {
    const orders = await this.loadOrders();
    return orders
      .filter(
        (o) => o.status.startsWith('complete-') || o.status.startsWith('canceled-'),
      )
      .sort(
        (a, b) =>
          new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
      );
  }
}
