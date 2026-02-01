import bcrypt from 'bcrypt';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { User, UserConfig } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '../../config/users.json');

const SALT_ROUNDS = 10;

export class UserService {
  private config: UserConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): UserConfig {
    if (!existsSync(CONFIG_PATH)) {
      throw new Error(`Users config not found at ${CONFIG_PATH}`);
    }
    const data = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  }

  public reloadConfig(): void {
    this.config = this.loadConfig();
  }

  public getSettings() {
    return this.config.settings;
  }

  public findByUsername(username: string): User | undefined {
    return this.config.users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.enabled
    );
  }

  public findById(id: string): User | undefined {
    return this.config.users.find((u) => u.id === id && u.enabled);
  }

  public async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  public static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  public getAllUsers(): Omit<User, 'passwordHash'>[] {
    return this.config.users.map(({ passwordHash, ...user }) => user);
  }
}

export const userService = new UserService();
